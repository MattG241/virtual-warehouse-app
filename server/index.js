import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initSchema, pool } from './db.js';
import { startSyncLoop, runSyncOnce, runPickSync } from './sync.js';
import { buildWarehouseData } from './shape.js';
import { attachSseRoute, publish } from './events.js';
import { attachExportRoutes } from './export.js';
import { attachAlertTestRoute } from './alerts.js';
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
attachAlertTestRoute(app);

app.post('/api/sync-now', express.json(), async (_req, res) => {
  try {
    const result = await runSyncOnce();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/picks/sync-now', express.json(), async (req, res) => {
  // Accept overrides from either query or JSON body — handy for ad-hoc
  // runs against alternate templates.
  const template =
    (req.query.template ? String(req.query.template) : null) ||
    (req.body && req.body.template) ||
    undefined;
  const columns =
    (req.query.columns ? String(req.query.columns) : null) ||
    (req.body && req.body.columns) ||
    undefined;
  try {
    const result = await runPickSync({ template, columns });
    res.json({ ok: true, template: template || null, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const allowed = new Set(['today', 'week', 'month']);
  const windowKey = allowed.has(String(req.query.window)) ? req.query.window : 'today';
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const mode = String(req.query.mode || 'diff');

  // Raw mode: return the latest snapshot per picker verbatim. Useful when
  // the PVX template already has the right time filter baked in (e.g.
  // "User activity - Today") so no diff is needed.
  if (mode === 'raw') {
    try {
      const r = await pool.query(
        `SELECT DISTINCT ON (picker)
                picker,
                items_picked       AS units,
                picks_completed    AS lines,
                orders_despatched  AS orders,
                items_skipped, containers_moved, item_movements,
                items_moved, packages_despatched, items_despatched,
                snapshot_at
           FROM pick_user_totals
          ORDER BY picker, snapshot_at DESC`,
      );
      const sorted = r.rows.sort((a, b) => b.units - a.units).slice(0, limit);
      res.set('Cache-Control', 'no-store');
      res.json({
        mode: 'raw',
        configured: Boolean(config.pvx.pickTemplate),
        rows: sorted,
        totalRows: r.rows.length,
        latest: r.rows.length ? r.rows[0].snapshot_at : null,
      });
      return;
    } catch (e) {
      console.error('[api/leaderboard raw] error:', e);
      res.status(500).json({ error: e.message });
      return;
    }
  }

  // PVX gives us cumulative totals — to get "activity within a window" we
  // diff the latest snapshot against the newest snapshot taken before the
  // window started. Users without a pre-window baseline are excluded from
  // that window's leaderboard until they accumulate history.
  const windowStartExpr = {
    today: "date_trunc('day', NOW())",
    week: "NOW() - INTERVAL '7 days'",
    month: "NOW() - INTERVAL '30 days'",
  }[windowKey];

  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (picker)
        picker, items_picked, picks_completed, orders_despatched, snapshot_at
      FROM pick_user_totals
      ORDER BY picker, snapshot_at DESC
    ),
    baseline AS (
      SELECT DISTINCT ON (picker)
        picker, items_picked, picks_completed, orders_despatched
      FROM pick_user_totals
      WHERE snapshot_at < ${windowStartExpr}
      ORDER BY picker, snapshot_at DESC
    )
    SELECT
      l.picker,
      GREATEST(l.items_picked      - COALESCE(b.items_picked, l.items_picked), 0)::int           AS units,
      GREATEST(l.picks_completed   - COALESCE(b.picks_completed, l.picks_completed), 0)::int    AS lines,
      GREATEST(l.orders_despatched - COALESCE(b.orders_despatched, l.orders_despatched), 0)::int AS orders
    FROM latest l
    LEFT JOIN baseline b ON b.picker = l.picker
    WHERE b.picker IS NOT NULL
      AND (l.items_picked - b.items_picked) > 0
    ORDER BY units DESC, lines DESC
    LIMIT $1`;

  try {
    const r = await pool.query(sql, [limit]);
    const totals = await pool.query(
      `SELECT COUNT(DISTINCT picker)::int AS total_rows, MAX(snapshot_at) AS latest
         FROM pick_user_totals`,
    );
    res.set('Cache-Control', 'no-store');
    res.json({
      window: windowKey,
      configured: Boolean(config.pvx.pickTemplate),
      rows: r.rows,
      totalRows: totals.rows[0]?.total_rows || 0,
      latest: totals.rows[0]?.latest || null,
    });
  } catch (e) {
    console.error('[api/leaderboard] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Serve the React build from web/dist. Asset filenames are content-hashed by
// Vite so we can cache aggressively; index.html stays no-cache so deploys
// roll out immediately.
import fs from 'node:fs';
const webDist = path.join(projectRoot, 'web', 'dist');
const hasWebBuild = fs.existsSync(path.join(webDist, 'index.html'));

if (hasWebBuild) {
  app.use(
    express.static(webDist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(?:js|css|woff2?|png|svg|jpg|jpeg|webp|ico)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  // SPA fallback: any non-API GET falls through to index.html so client-side
  // routing works on hard refresh.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  // The frontend hasn't been built. Tell the user clearly instead of
  // silently 404ing every page request.
  console.error(
    '[server] web/dist not found. Run `npm --prefix web ci && npm --prefix web run build` first.',
  );
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res
      .status(503)
      .type('text/plain')
      .send('Frontend not built. Run: npm --prefix web ci && npm --prefix web run build');
  });
}

let httpServer;

async function main() {
  await initSchema();
  startSyncLoop();
  httpServer = app.listen(config.port, () => {
    console.log(`[server] listening on http://localhost:${config.port}`);
  });
}

// Graceful shutdown — Railway sends SIGTERM on deploy/restart. Drain the
// HTTP server and close the pg pool so in-flight requests finish cleanly.
function shutdown(signal) {
  console.log(`[server] received ${signal}, draining…`);
  let exited = false;
  const force = setTimeout(() => {
    if (!exited) {
      console.warn('[server] shutdown timeout — forcing exit');
      process.exit(1);
    }
  }, 10_000).unref();

  Promise.resolve()
    .then(() => new Promise((resolve) => (httpServer ? httpServer.close(resolve) : resolve())))
    .then(() => pool.end())
    .then(() => {
      exited = true;
      clearTimeout(force);
      process.exit(0);
    })
    .catch((e) => {
      console.error('[server] shutdown error:', e);
      process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
});

main().catch((e) => {
  console.error('[server] fatal:', e);
  process.exit(1);
});
