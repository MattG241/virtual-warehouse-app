import { config } from './config.js';
import { pool, initSchema } from './db.js';
import { PvxClient } from './pvx.js';
import { publish } from './events.js';
import { postSyncFailure, postStockDeltas, postAisleFullness } from './alerts.js';

let running = false;

export async function runSyncOnce() {
  if (running) {
    console.log('[sync] skip — previous run still in progress');
    return { skipped: true };
  }
  running = true;

  const client = await pool.connect();
  let runId;
  try {
    const startRow = await client.query(
      `INSERT INTO sync_runs (status) VALUES ('running') RETURNING id`,
    );
    runId = startRow.rows[0].id;
  } finally {
    client.release();
  }

  const startedAt = Date.now();
  console.log(`[sync] run #${runId} started`);
  publish('sync.started', { runId, startedAt });

  try {
    const pvx = new PvxClient(config.pvx);

    const rows = [];
    let header = null;
    let totalCount = 0;

    for await (const event of pvx.iterateAllRows({
      template: config.pvx.template,
      columns: config.pvx.columns,
      pageSize: config.sync.pageSize,
      pageDelayMs: config.sync.pageDelayMs,
    })) {
      if (event.header) {
        header = event.header;
        totalCount = event.totalCount;
        console.log(`[sync] template=${config.pvx.template} totalCount=${totalCount}`);
        continue;
      }
      if (event.row) rows.push(event.row);
    }

    if (!header) throw new Error('PVX returned no header row');

    const idx = buildColumnIndex(header);
    requireColumns(idx, ['Item Code', 'Stock Count', 'Location barcode']);

    const mapped = rows.map((r) => ({
      item_code: r[idx['Item Code']] ?? '',
      item_name: r[idx['Name']] ?? '',
      stock_count: toInt(r[idx['Stock Count']]),
      container_barcode: r[idx['Container Barcode']] ?? '',
      location_barcode: r[idx['Location barcode']] ?? '',
      site_reference: r[idx['Site reference']] ?? '',
      location_type: r[idx['Location type']] ?? '',
      item_type_group: r[idx['Item type group']] ?? '',
      item_barcode: r[idx['Item Barcode']] ?? '',
    })).filter((r) => r.item_code && r.location_barcode);

    // Dedupe in JS (same PK shows up if PVX yields the same combo twice).
    const deduped = new Map();
    for (const r of mapped) {
      const key = `${r.item_code}${r.location_barcode}${r.container_barcode}${r.site_reference}`;
      const prev = deduped.get(key);
      if (prev) {
        prev.stock_count += r.stock_count;
      } else {
        deduped.set(key, r);
      }
    }
    const finalRows = [...deduped.values()];

    const tx = await pool.connect();
    try {
      await tx.query('BEGIN');
      await tx.query('TRUNCATE TABLE stock_items');
      await bulkInsert(tx, finalRows);
      await tx.query(
        `UPDATE sync_runs SET finished_at = NOW(), row_count = $1, status = 'ok' WHERE id = $2`,
        [finalRows.length, runId],
      );
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }

    console.log(
      `[sync] run #${runId} ok — ${finalRows.length} rows in ${Date.now() - startedAt}ms`,
    );
    publish('sync.completed', {
      runId,
      rowCount: finalRows.length,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
    // Fire alert checks after a successful sync. Failures inside these are
    // logged but never rethrown — alerting must not break the sync result.
    postStockDeltas(runId);
    postAisleFullness(runId);
    // Pick activity sync is best-effort and isolated — never breaks inventory.
    runPickSync().catch((e) => console.error('[pick-sync] failed:', e.message));
    runOrderSnapshot().catch((e) => console.error('[order-snap] failed:', e.message));
    return { runId, rowCount: finalRows.length };
  } catch (err) {
    console.error(`[sync] run #${runId} failed:`, err.message);
    await pool.query(
      `UPDATE sync_runs SET finished_at = NOW(), status = 'error', error_text = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 2000), runId],
    );
    publish('sync.failed', { runId, error: String(err.message || err).slice(0, 300) });
    postSyncFailure(runId, String(err.message || err));
    throw err;
  } finally {
    running = false;
  }
}

export function startSyncLoop() {
  const tick = async () => {
    try {
      await runSyncOnce();
    } catch (e) {
      // already logged
    }
  };
  tick();
  setInterval(tick, config.sync.intervalMs);
  console.log(`[sync] loop started — every ${config.sync.intervalMs / 1000}s`);
}

function buildColumnIndex(header) {
  const idx = {};
  header.forEach((name, i) => {
    idx[name.trim()] = i;
  });
  return idx;
}

function requireColumns(idx, names) {
  const missing = names.filter((n) => !(n in idx));
  if (missing.length) {
    throw new Error(`PVX response missing required columns: ${missing.join(', ')}`);
  }
}

function toInt(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

async function bulkInsert(tx, rows) {
  if (!rows.length) return;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    chunk.forEach((r, j) => {
      const o = j * 9;
      values.push(
        `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`,
      );
      params.push(
        r.item_code,
        r.item_name,
        r.stock_count,
        r.container_barcode,
        r.location_barcode,
        r.site_reference,
        r.location_type,
        r.item_type_group,
        r.item_barcode,
      );
    });
    await tx.query(
      `INSERT INTO stock_items
        (item_code, item_name, stock_count, container_barcode, location_barcode, site_reference, location_type, item_type_group, item_barcode)
       VALUES ${values.join(',')}`,
      params,
    );
  }
}

// --- Pick activity sync ---------------------------------------------------
// Each time window (today / week-to-date / month-to-date) is driven by its
// own PVX report template — the date filter lives at the template level.
// We just read the latest per-user totals each cycle and write them into
// pick_user_totals (keyed by window). DELETE-then-INSERT per window so
// pickers who fall out of the report don't linger.

const TOTAL_COLS = [
  // [csv column header,   db column name]
  ['Picks completed',          'picks_completed'],
  ['Items picked',             'items_picked'],
  ['Items skipped',            'items_skipped'],
  ['Containers moved',         'containers_moved'],
  ['Item movements performed', 'item_movements'],
  ['Items moved',              'items_moved'],
  ['Orders despatched',        'orders_despatched'],
  ['Packages despatched',      'packages_despatched'],
  ['Items despatched',         'items_despatched'],
];

const ALL_WINDOWS = ['today', 'week', 'month', 'ytd'];

let pickRunning = false;
export async function runPickSync(opts = {}) {
  if (pickRunning) return { skipped: 'previous pick sync still running' };
  pickRunning = true;

  // Decide which (window, template) pairs to run. Per-call overrides win.
  let targets;
  if (opts.template) {
    targets = [{ windowKey: opts.windowKey || 'today', template: opts.template }];
  } else {
    targets = ALL_WINDOWS
      .map((w) => ({ windowKey: w, template: config.pvx.pickTemplates[w] }))
      .filter((t) => t.template);
  }
  if (targets.length === 0) {
    pickRunning = false;
    return { skipped: 'no pick templates configured' };
  }

  const startedAt = Date.now();
  const results = {};

  try {
    for (const t of targets) {
      try {
        const r = await syncOneWindow(t.windowKey, t.template, opts.columns);
        results[t.windowKey] = r;
      } catch (e) {
        console.error(`[pick-sync] ${t.windowKey} failed:`, e.message);
        results[t.windowKey] = { error: e.message };
      }
    }
    console.log(
      `[pick-sync] all windows done in ${Date.now() - startedAt}ms — ${JSON.stringify(results)}`,
    );
    publish('picks.completed', {
      results,
      finishedAt: new Date().toISOString(),
    });
    return { results };
  } finally {
    pickRunning = false;
  }
}

async function syncOneWindow(windowKey, template, columnsOverride) {
  const columns = columnsOverride || config.pvx.pickColumns;
  console.log(`[pick-sync] ${windowKey}: pulling template="${template}"`);

  const pvx = new PvxClient(config.pvx);
  const rows = [];
  let header = null;

  for await (const event of pvx.iterateAllRows({
    template,
    columns,
    pageSize: config.sync.pageSize,
    pageDelayMs: config.sync.pageDelayMs,
  })) {
    if (event.header) {
      header = event.header;
      continue;
    }
    if (event.row) rows.push(event.row);
  }

  if (!header) {
    return { skipped: 'no header' };
  }

  const idx = buildColumnIndex(header);
  const userCol = config.pvx.pickUserCol;

  if (!(userCol in idx)) {
    throw new Error(
      `pick template missing user column "${userCol}". ` +
        `Available: ${Object.keys(idx).join(', ')}`,
    );
  }

  const colMap = TOTAL_COLS.map(([csv, db]) => ({ db, index: idx[csv] }));

  const mapped = rows
    .map((r) => {
      const picker = String(r[idx[userCol]] ?? '').trim();
      if (!picker) return null;
      const out = { picker };
      let activitySum = 0;
      for (const { db, index } of colMap) {
        const v = index === undefined ? 0 : toInt(r[index]);
        out[db] = v;
        activitySum += v;
      }
      // Skip system / dormant users (Admin, Pvx*, etc.) — they always 0.
      if (activitySum === 0) return null;
      return out;
    })
    .filter(Boolean);

  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query(`DELETE FROM pick_user_totals WHERE window_key = $1`, [windowKey]);
    await bulkInsertPickTotals(tx, mapped, windowKey);
    await tx.query('COMMIT');
  } catch (e) {
    await tx.query('ROLLBACK');
    throw e;
  } finally {
    tx.release();
  }

  return { rowCount: mapped.length, template };
}

async function bulkInsertPickTotals(tx, rows, windowKey) {
  if (!rows.length) return;
  const cols = TOTAL_COLS.map(([, db]) => db);
  // Columns per row: picker + window_key + 9 metric cols = 11
  const colsPerRow = 2 + cols.length;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    chunk.forEach((r, j) => {
      const o = j * colsPerRow;
      const placeholders = Array.from({ length: colsPerRow }, (_, k) => `$${o + k + 1}`);
      values.push(`(${placeholders.join(',')})`);
      params.push(r.picker, windowKey, ...cols.map((c) => r[c] || 0));
    });
    await tx.query(
      `INSERT INTO pick_user_totals (picker, window_key, ${cols.join(', ')})
       VALUES ${values.join(',')}
       ON CONFLICT (picker, window_key) DO UPDATE SET
         ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
         updated_at = NOW()`,
      params,
    );
  }
}

// --- Open-orders snapshot -------------------------------------------------
// Pulls a PVX report listing every currently-open sales order and stores
// the row count in order_state. The first count captured after the
// configured baseline hour (default 8am, warehouse tz) becomes the day's
// progress-bar denominator in order_baselines. Opt-in via
// PVX_OPEN_ORDERS_TEMPLATE — blank == feature off.

let orderSnapRunning = false
export async function runOrderSnapshot(opts = {}) {
  const template = config.pvx.openOrdersTemplate;
  if (!template) return { skipped: 'PVX_OPEN_ORDERS_TEMPLATE not set' };
  if (orderSnapRunning) return { skipped: 'previous order snapshot still running' };
  orderSnapRunning = true;

  // Caller can ask us to drop today's baseline before snapshotting — handy
  // after swapping the open-orders template and you want today's bar
  // denominator to be set by the new report.
  if (opts.resetTodayBaseline) {
    const { date: localDate } = warehouseDateParts();
    await pool.query(`DELETE FROM order_baselines WHERE day = $1::date`, [localDate]);
    console.log(`[order-snap] reset today's baseline (${localDate})`);
  }

  const startedAt = Date.now();
  console.log(`[order-snap] starting template="${template}"`);

  try {
    const pvx = new PvxClient(config.pvx);
    // We only need the total count of open orders, not the row data.
    // PVX's `Outstanding sales orders` template returns an empty body
    // when paged at the standard 1000-row size, so request a tiny page
    // and read totalCount from PVX's response header.
    await pvx.ensureSession();
    const { totalCount, csv } = await pvx.getReportPage({
      template,
      columns: config.pvx.openOrdersColumns,
      pageNo: 1,
      pageSize: 10,
    });

    if (csv.length === 0 && totalCount === 0) {
      console.log('[order-snap] empty response — skipping');
      return { skipped: 'no data' };
    }
    const openCount = totalCount;

    // Update current-open singleton.
    await pool.query(
      `INSERT INTO order_state (id, open_count, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         open_count = EXCLUDED.open_count, updated_at = NOW()`,
      [openCount],
    );

    // Baseline lifecycle each day:
    //   • At/after baselineHour (8am default) — first sync inserts the
    //     morning denominator. Subsequent syncs leave it alone.
    //   • At/after resetHour (4pm default, if non-zero) — first sync past
    //     this point OVERWRITES the existing baseline with the current
    //     open count, so the bar restarts at 0% for the afternoon shift.
    const { date: localDate, hour: localHour } = warehouseDateParts();
    const resetHour = config.resetHour;
    const existing = await pool.query(
      `SELECT baseline_count, captured_at FROM order_baselines WHERE day = $1::date`,
      [localDate],
    );
    const haveBaseline = existing.rows.length > 0;
    const baselineCapturedHour = haveBaseline
      ? warehouseDatePartsFor(new Date(existing.rows[0].captured_at)).hour
      : null;
    const pastResetCutoff = resetHour > 0 && localHour >= resetHour;
    const baselineIsPreReset = baselineCapturedHour != null && baselineCapturedHour < resetHour;

    if (!haveBaseline && localHour >= config.baselineHour) {
      await pool.query(
        `INSERT INTO order_baselines (day, baseline_count, captured_at)
         VALUES ($1::date, $2, NOW())
         ON CONFLICT (day) DO NOTHING`,
        [localDate, openCount],
      );
      console.log(`[order-snap] morning baseline captured: ${openCount}`);
    } else if (haveBaseline && pastResetCutoff && baselineIsPreReset) {
      await pool.query(
        `UPDATE order_baselines
            SET baseline_count = $1, captured_at = NOW()
          WHERE day = $2::date`,
        [openCount, localDate],
      );
      console.log(`[order-snap] afternoon baseline reset at ${resetHour}:00 — ${openCount}`);
    }

    console.log(
      `[order-snap] ok — ${openCount} open orders in ${Date.now() - startedAt}ms`,
    );
    publish('orders.snapshot', {
      openCount,
      finishedAt: new Date().toISOString(),
    });
    return { openCount };
  } finally {
    orderSnapRunning = false;
  }
}

function warehouseDatePartsFor(date) {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: config.warehouseTz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: parseInt(parts.hour, 10) || 0,
  };
}

function warehouseDateParts() {
  return warehouseDatePartsFor(new Date());
}

// CLI: node server/sync.js --once
if (process.argv[1] && process.argv[1].endsWith('sync.js')) {
  if (process.argv.includes('--once')) {
    initSchema()
      .then(runSyncOnce)
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  }
}
