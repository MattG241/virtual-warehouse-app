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
// PVX's "User activity" report returns cumulative per-user totals (no
// timestamps), so we snapshot the full table on every sync and compute
// window-relative leaderboards by diffing snapshots in the query layer.
// Opt-in via PVX_PICK_TEMPLATE — if blank, this is a no-op.

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

let pickRunning = false;
export async function runPickSync() {
  if (!config.pvx.pickTemplate) return { skipped: 'PVX_PICK_TEMPLATE not set' };
  if (pickRunning) return { skipped: 'previous pick sync still running' };
  pickRunning = true;

  const startedAt = Date.now();
  console.log(`[pick-sync] starting template="${config.pvx.pickTemplate}"`);

  try {
    const pvx = new PvxClient(config.pvx);
    const rows = [];
    let header = null;

    for await (const event of pvx.iterateAllRows({
      template: config.pvx.pickTemplate,
      columns: config.pvx.pickColumns,
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
      console.log('[pick-sync] no header returned — leaving table as-is');
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

    // Map the 9 metric columns once; missing columns become 0 (graceful).
    const colMap = TOTAL_COLS.map(([csv, db]) => ({
      db,
      index: idx[csv],
    }));

    const snapshotAt = new Date();
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
      await bulkInsertPickTotals(tx, mapped, snapshotAt);
      // Bound storage: 35 days covers the 30d window with a few days of slack.
      await tx.query(
        `DELETE FROM pick_user_totals WHERE snapshot_at < NOW() - INTERVAL '35 days'`,
      );
      await tx.query('COMMIT');
    } catch (e) {
      await tx.query('ROLLBACK');
      throw e;
    } finally {
      tx.release();
    }

    console.log(
      `[pick-sync] ok — ${mapped.length} active pickers in ${Date.now() - startedAt}ms`,
    );
    publish('picks.completed', {
      rowCount: mapped.length,
      finishedAt: new Date().toISOString(),
    });
    return { rowCount: mapped.length };
  } finally {
    pickRunning = false;
  }
}

async function bulkInsertPickTotals(tx, rows, snapshotAt) {
  if (!rows.length) return;
  const cols = TOTAL_COLS.map(([, db]) => db);
  // Columns per row: picker + 9 metric cols + snapshot_at = 11
  const colsPerRow = 1 + cols.length + 1;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    chunk.forEach((r, j) => {
      const o = j * colsPerRow;
      const placeholders = Array.from({ length: colsPerRow }, (_, k) => `$${o + k + 1}`);
      values.push(`(${placeholders.join(',')})`);
      params.push(r.picker, ...cols.map((c) => r[c] || 0), snapshotAt);
    });
    await tx.query(
      `INSERT INTO pick_user_totals (picker, ${cols.join(', ')}, snapshot_at)
       VALUES ${values.join(',')}
       ON CONFLICT (picker, snapshot_at) DO NOTHING`,
      params,
    );
  }
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
