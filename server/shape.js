import { pool } from './db.js';

const GRID_RE = /^A(\d+)\.B(\d+)\.L(\d+)\.S(\d+)$/i;

export async function buildWarehouseData() {
  const [stockRes, syncRes] = await Promise.all([
    pool.query(
      `SELECT item_code, item_name, stock_count, container_barcode,
              location_barcode, site_reference, location_type, item_type_group
         FROM stock_items
        WHERE stock_count > 0`,
    ),
    pool.query(
      `SELECT id, started_at, finished_at, row_count, status, error_text
         FROM sync_runs
        WHERE status = 'ok'
        ORDER BY id DESC
        LIMIT 1`,
    ),
  ]);

  const grid = {};
  const other = [];
  const skus = {};
  const aisleBays = {};
  let maxLevel = 0;
  let maxSlot = 0;

  for (const r of stockRes.rows) {
    if (!skus[r.item_code]) {
      // Frontend tuple is [name, color, size]. PVX has no separate color/size columns
      // — they're encoded in the SKU suffix — so we leave those blank and let the
      // visualiser fall back to the SKU code for display.
      skus[r.item_code] = [r.item_name || '', '', ''];
    }

    const m = GRID_RE.exec(r.location_barcode);
    if (m) {
      const aisle = Number(m[1]);
      const bay = Number(m[2]);
      const level = Number(m[3]);
      const slot = Number(m[4]);

      const code = `A${aisle}.B${pad2(bay)}.L${pad2(level)}.S${pad2(slot)}`;
      (grid[code] ||= []).push([r.item_code, r.stock_count, r.location_type || 'Pick']);

      const aisleKey = String(aisle);
      aisleBays[aisleKey] = Math.max(aisleBays[aisleKey] || 0, bay);
      if (level > maxLevel) maxLevel = level;
      if (slot > maxSlot) maxSlot = slot;
    } else {
      other.push([
        r.location_barcode,
        r.item_code,
        r.stock_count,
        r.location_type || 'Pick',
        r.item_type_group || '',
      ]);
    }
  }

  const lastSync = syncRes.rows[0];
  return {
    generatedAt: lastSync?.finished_at ? new Date(lastSync.finished_at).toISOString() : '',
    rowCount: stockRes.rowCount,
    aisleBays,
    levels: maxLevel || 7,
    slots: maxSlot || 7,
    skus,
    grid,
    other,
    syncStatus: lastSync
      ? {
          id: lastSync.id,
          finishedAt: lastSync.finished_at,
          rowCount: lastSync.row_count,
        }
      : null,
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}
