import pg from 'pg';
import { config } from './config.js';

const needsSsl = /[?&]sslmode=require/i.test(config.databaseUrl) || /railway|render|heroku/i.test(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
});

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_items (
      item_code         TEXT NOT NULL,
      item_name         TEXT NOT NULL DEFAULT '',
      stock_count       INTEGER NOT NULL DEFAULT 0,
      container_barcode TEXT NOT NULL DEFAULT '',
      location_barcode  TEXT NOT NULL,
      site_reference    TEXT NOT NULL DEFAULT '',
      location_type     TEXT NOT NULL DEFAULT '',
      item_type_group   TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (item_code, location_barcode, container_barcode, site_reference)
    );

    CREATE INDEX IF NOT EXISTS stock_items_location_idx ON stock_items(location_barcode);
    CREATE INDEX IF NOT EXISTS stock_items_item_idx ON stock_items(item_code);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id          SERIAL PRIMARY KEY,
      started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      row_count   INTEGER,
      status      TEXT NOT NULL,
      error_text  TEXT
    );

    CREATE TABLE IF NOT EXISTS warehouse_layout (
      id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
