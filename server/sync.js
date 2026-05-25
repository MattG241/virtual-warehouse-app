import { config } from './config.js';
import { pool, initSchema } from './db.js';
import { PvxClient } from './pvx.js';
import { publish } from './events.js';

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
    return { runId, rowCount: finalRows.length };
  } catch (err) {
    console.error(`[sync] run #${runId} failed:`, err.message);
    await pool.query(
      `UPDATE sync_runs SET finished_at = NOW(), status = 'error', error_text = $1 WHERE id = $2`,
      [String(err.message || err).slice(0, 2000), runId],
    );
    publish('sync.failed', { runId, error: String(err.message || err).slice(0, 300) });
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
      const o = j * 8;
      values.push(
        `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8})`,
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
      );
    });
    await tx.query(
      `INSERT INTO stock_items
        (item_code, item_name, stock_count, container_barcode, location_barcode, site_reference, location_type, item_type_group)
       VALUES ${values.join(',')}`,
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
