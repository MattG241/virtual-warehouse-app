import { pool } from './db.js';

const GRID_RE = /^A(\d+)\.B(\d+)\.L(\d+)\.S(\d+)$/i;

// Physical warehouse layout — used as a baseline so the UI shows every aisle
// and bay even when some are temporarily empty. Observed values are merged on
// top, so a brand-new bay shows up automatically once it carries stock.
const DEFAULT_AISLE_BAYS = {
  '1': 13,
  '2': 18,
  '3': 25,
  '4': 23,
  '5': 22,
  '6': 22,
  '7': 21,
  '8': 22,
  '9': 22,
  '10': 21,
};
const DEFAULT_LEVELS = 7;
const DEFAULT_SLOTS = 7;

export async function buildWarehouseData() {
  const [stockRes, syncRes, layoutRes] = await Promise.all([
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
    pool.query(`SELECT data FROM warehouse_layout WHERE id = 1`),
  ]);
  const layout = layoutRes.rows[0]?.data || null;

  const grid = {};
  const other = [];
  const skus = {};
  const observedAisleBays = {};
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

      // Match the frontend's canonical key: A{aa}.B{bb}.L{ll}.S{n}
      // (aisle/bay/level zero-padded to 2 digits, slot NOT padded).
      const code = `A${pad2(aisle)}.B${pad2(bay)}.L${pad2(level)}.S${slot}`;
      (grid[code] ||= []).push([r.item_code, r.stock_count, r.location_type || 'Pick']);

      const aisleKey = String(aisle);
      observedAisleBays[aisleKey] = Math.max(observedAisleBays[aisleKey] || 0, bay);
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

  // Merge defaults with observed so empty aisles/bays still render but new
  // physical additions are picked up automatically.
  const aisleBays = { ...DEFAULT_AISLE_BAYS };
  for (const [k, v] of Object.entries(observedAisleBays)) {
    aisleBays[k] = Math.max(aisleBays[k] || 0, v);
  }

  const lastSync = syncRes.rows[0];
  return {
    generatedAt: lastSync?.finished_at ? new Date(lastSync.finished_at).toISOString() : '',
    rowCount: stockRes.rowCount,
    aisleBays,
    levels: Math.max(maxLevel, DEFAULT_LEVELS),
    slots: Math.max(maxSlot, DEFAULT_SLOTS),
    skus,
    grid,
    other,
    layout,
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
