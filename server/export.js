import { pool } from './db.js';

const CSV_BOM = '﻿'; // Excel needs the BOM to read UTF-8 correctly

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','));
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

function dateStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

export function attachExportRoutes(app) {
  app.get('/api/export/snapshot.csv', async (_req, res) => {
    try {
      const r = await pool.query(`
        SELECT item_code, item_name, item_barcode, stock_count,
               container_barcode, location_barcode, site_reference,
               location_type, item_type_group
          FROM stock_items
         WHERE stock_count > 0
         ORDER BY item_code, location_barcode
      `);
      const csv = toCsv(
        [
          'item_code',
          'item_name',
          'item_barcode',
          'stock_count',
          'container_barcode',
          'location_barcode',
          'site_reference',
          'location_type',
          'item_type_group',
        ],
        r.rows,
      );
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="warehouse-snapshot-${dateStamp()}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.send(csv);
    } catch (e) {
      console.error('[export/snapshot] error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/export/low-stock.csv', async (req, res) => {
    const threshold = Math.max(0, Math.min(1000, Number(req.query.threshold) || 5));
    try {
      const r = await pool.query(
        `
        SELECT item_code, item_name, item_barcode, stock_count,
               location_barcode, site_reference, item_type_group
          FROM stock_items
         WHERE stock_count > 0 AND stock_count <= $1
         ORDER BY stock_count, item_code
      `,
        [threshold],
      );
      const csv = toCsv(
        [
          'item_code',
          'item_name',
          'item_barcode',
          'stock_count',
          'location_barcode',
          'site_reference',
          'item_type_group',
        ],
        r.rows,
      );
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="warehouse-low-stock-le${threshold}-${dateStamp()}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.send(csv);
    } catch (e) {
      console.error('[export/low-stock] error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/export/zero-stock-items.csv', async (_req, res) => {
    try {
      // SKUs that exist in the table but currently have zero total stock
      const r = await pool.query(`
        SELECT item_code, item_name, item_barcode,
               SUM(stock_count) AS total_stock,
               COUNT(*) FILTER (WHERE stock_count > 0) AS active_locations
          FROM stock_items
         GROUP BY item_code, item_name, item_barcode
        HAVING SUM(stock_count) = 0
         ORDER BY item_code
      `);
      const csv = toCsv(
        ['item_code', 'item_name', 'item_barcode', 'total_stock', 'active_locations'],
        r.rows,
      );
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="warehouse-zero-stock-${dateStamp()}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.send(csv);
    } catch (e) {
      console.error('[export/zero-stock] error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/export/by-aisle.csv', async (_req, res) => {
    try {
      const r = await pool.query(`
        SELECT
          SUBSTRING(location_barcode FROM '^A(\\d+)\\.') AS aisle,
          item_code,
          item_name,
          SUM(stock_count) AS units,
          COUNT(DISTINCT location_barcode) AS locations
          FROM stock_items
         WHERE stock_count > 0
           AND location_barcode ~ '^A\\d+\\.B\\d+\\.L\\d+\\.S\\d+$'
         GROUP BY aisle, item_code, item_name
         ORDER BY aisle::int, item_code
      `);
      const csv = toCsv(
        ['aisle', 'item_code', 'item_name', 'units', 'locations'],
        r.rows,
      );
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="warehouse-by-aisle-${dateStamp()}.csv"`,
        'Cache-Control': 'no-store',
      });
      res.send(csv);
    } catch (e) {
      console.error('[export/by-aisle] error:', e);
      res.status(500).json({ error: e.message });
    }
  });
}
