import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initSchema, pool } from './db.js';
import { startSyncLoop, runSyncOnce } from './sync.js';
import { buildWarehouseData } from './shape.js';
import { attachSseRoute, publish } from './events.js';
import { attachExportRoutes } from './export.js';
import {
  isAllowed,
  validateEmail,
  validatePassword,
  PASSWORD_MIN,
  findUser,
  createUser,
  markLogin,
  verifyPasswordHash,
  setSessionCookie,
  clearSessionCookie,
  authFromRequest,
  requireAuth,
  logAudit,
} from './auth.js';

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

app.put('/api/layout', requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
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
    const clientId = req.get('X-Client-Id') || null;
    await logAudit(req.user.email, 'layout.update', {
      aisleCount: body.aisles.length,
      clientId,
    });
    publish('layout.updated', {
      clientId,
      updatedAt: new Date().toISOString(),
      userEmail: req.user.email,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[api/layout PUT] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// --- Auth endpoints -------------------------------------------------------
app.post('/api/auth/register', express.json(), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!validateEmail(email)) {
    res.status(400).json({ error: 'valid email required' });
    return;
  }
  if (!validatePassword(password)) {
    res.status(400).json({ error: `password must be at least ${PASSWORD_MIN} characters` });
    return;
  }
  if (!isAllowed(email)) {
    // Don't reveal that we have an allow-list
    res.status(403).json({ error: 'registration not permitted for this email' });
    return;
  }
  const existing = await findUser(email);
  if (existing) {
    res.status(409).json({ error: 'an account already exists for this email' });
    return;
  }
  try {
    await createUser(email, password);
    setSessionCookie(res, email);
    await markLogin(email);
    await logAudit(email, 'auth.register', {});
    res.json({ ok: true, user: { email } });
  } catch (e) {
    console.error('[auth/register] error:', e);
    res.status(500).json({ error: 'could not create account' });
  }
});

app.post('/api/auth/login', express.json(), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!validateEmail(email) || !password) {
    res.status(400).json({ error: 'email and password required' });
    return;
  }
  try {
    const user = await findUser(email);
    if (!user || !(await verifyPasswordHash(password, user.password_hash))) {
      // Same response for unknown email and wrong password — no enumeration.
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }
    setSessionCookie(res, email);
    await markLogin(email);
    await logAudit(email, 'auth.login', {});
    res.json({ ok: true, user: { email } });
  } catch (e) {
    console.error('[auth/login] error:', e);
    res.status(500).json({ error: 'sign-in failed' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const auth = authFromRequest(req);
  res.json({ user: auth });
});

app.post('/api/auth/logout', async (req, res) => {
  const auth = authFromRequest(req);
  clearSessionCookie(res);
  if (auth) await logAudit(auth.email, 'auth.logout', {});
  res.json({ ok: true });
});

app.get('/api/audit', requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const r = await pool.query(
    `SELECT id, user_email, action, payload, created_at
       FROM audit_log
      ORDER BY id DESC
      LIMIT $1`,
    [limit],
  );
  res.json({ entries: r.rows });
});

attachSseRoute(app);
attachExportRoutes(app);

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
