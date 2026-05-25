import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initSchema, pool } from './db.js';
import { startSyncLoop, runSyncOnce } from './sync.js';
import { buildWarehouseData } from './shape.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const app = express();

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/inventory', async (_req, res) => {
  try {
    const data = await buildWarehouseData();
    res.set('Cache-Control', 'no-store');
    res.json(data);
  } catch (e) {
    console.error('[api/inventory] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sync-status', async (_req, res) => {
  const r = await pool.query(
    `SELECT id, started_at, finished_at, row_count, status, error_text
       FROM sync_runs ORDER BY id DESC LIMIT 10`,
  );
  res.json({ runs: r.rows });
});

app.get('/api/layout', async (_req, res) => {
  try {
    const r = await pool.query(`SELECT data, updated_at FROM warehouse_layout WHERE id = 1`);
    if (!r.rows[0]) {
      res.status(404).json({ layout: null });
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.json({ layout: r.rows[0].data, updatedAt: r.rows[0].updated_at });
  } catch (e) {
    console.error('[api/layout GET] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/layout', express.json({ limit: '2mb' }), async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || !Array.isArray(body.aisles)) {
    res.status(400).json({ error: 'expected { aisles: [...] }' });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO warehouse_layout (id, data, updated_at)
       VALUES (1, $1::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [JSON.stringify(body)],
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[api/layout PUT] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sync-now', express.json(), async (_req, res) => {
  try {
    const result = await runSyncOnce();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Serve the existing static frontend (index.html, app.js, styles.css, bootstrap.js).
// inventory.js is still served, but bootstrap.js overrides window.WAREHOUSE_DATA
// from the API before app.js runs.
app.use(
  express.static(projectRoot, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html') || filePath.endsWith('bootstrap.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }),
);

async function main() {
  await initSchema();
  startSyncLoop();
  app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
}

main().catch((e) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
