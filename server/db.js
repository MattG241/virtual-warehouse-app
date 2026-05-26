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
      item_barcode      TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (item_code, location_barcode, container_barcode, site_reference)
    );

    -- Migration for existing installs that pre-date the item_barcode column.
    ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS item_barcode TEXT NOT NULL DEFAULT '';

    CREATE TABLE IF NOT EXISTS alert_state (
      key        TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id         BIGSERIAL PRIMARY KEY,
      user_email TEXT,
      action     TEXT NOT NULL,
      payload    JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);

    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    -- Old per-event design replaced by snapshot diffing against
    -- cumulative totals from PVX's "User activity" report.
    DROP TABLE IF EXISTS pick_activity;

    CREATE TABLE IF NOT EXISTS pick_user_totals (
      picker              TEXT NOT NULL,
      picks_completed     INTEGER NOT NULL DEFAULT 0,
      items_picked        INTEGER NOT NULL DEFAULT 0,
      items_skipped       INTEGER NOT NULL DEFAULT 0,
      containers_moved    INTEGER NOT NULL DEFAULT 0,
      item_movements      INTEGER NOT NULL DEFAULT 0,
      items_moved         INTEGER NOT NULL DEFAULT 0,
      orders_despatched   INTEGER NOT NULL DEFAULT 0,
      packages_despatched INTEGER NOT NULL DEFAULT 0,
      items_despatched    INTEGER NOT NULL DEFAULT 0,
      snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (picker, snapshot_at)
    );

    CREATE INDEX IF NOT EXISTS pick_user_totals_picker_at_idx
      ON pick_user_totals(picker, snapshot_at DESC);
    CREATE INDEX IF NOT EXISTS pick_user_totals_at_idx
      ON pick_user_totals(snapshot_at DESC);
  `);
}
