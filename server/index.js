import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initSchema, pool } from './db.js';
import { startSyncLoop, runSyncOnce } from './sync.js';
import { buildWarehouseData } from './shape.js';
import { attachSseRoute, publish } from './events.js';
import {
  isAllowed,
  makeLoginToken,
  verifyLoginToken,
  setSessionCookie,
  clearSessionCookie,
  authFromRequest,
  requireAuth,
  sendMagicLink,
  appUrl,
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
app.post('/api/auth/request', express.json(), async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'valid email required' });
    return;
  }
  // Always respond ok so we don't leak which emails are allowed.
  if (!isAllowed(email)) {
    console.log(`[auth] sign-in attempt for unallowed email: ${email}`);
    res.json({ ok: true });
    return;
  }
  try {
    const token = makeLoginToken(email);
    const link = `${appUrl(req)}/api/auth/verify?token=${encodeURIComponent(token)}`;
    const result = await sendMagicLink(email, link);
    res.json({ ok: true, delivery: result.delivered });
  } catch (e) {
    console.error('[auth] send failed:', e.message);
    res.status(500).json({ error: 'could not send sign-in link' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const claims = verifyLoginToken(String(req.query.token || ''));
  if (!claims) {
    res
      .status(400)
      .set('Content-Type', 'text/html')
      .send(`<!doctype html><html><head><title>Sign-in failed</title><meta charset="utf-8"><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:80px auto;padding:24px;color:#0f172a}h1{font-size:20px}a{color:#2563eb}</style></head><body><h1>Invalid or expired link</h1><p>Sign-in links expire after 15 minutes. <a href="/">Try again</a>.</p></body></html>`);
    return;
  }
  setSessionCookie(res, claims.sub);
  await logAudit(claims.sub, 'auth.login', {});
  res.redirect('/');
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
