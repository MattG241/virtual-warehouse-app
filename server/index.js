import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { initSchema, pool } from './db.js';
import { startSyncLoop, runSyncOnce, runPickSync, runOrderSnapshot } from './sync.js';
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

app.post('/api/orders/sync-now', express.json(), async (req, res) => {
  // ?reset=1 wipes today's baseline before snapshotting — use after
  // swapping the open-orders template so the bar's denominator picks
  // up the new report's count immediately.
  const resetTodayBaseline = String(req.query.reset || '') === '1';
  try {
    const result = await runOrderSnapshot({ resetTodayBaseline });
    res.json({ ok: true, reset: resetTodayBaseline, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Diagnostic: hit a PVX template directly and return what came back.
// Useful when a configured template returns 0 rows unexpectedly — lets
// us see the raw header + first few rows of the CSV PVX gave us.
app.get('/api/debug/pvx-report', async (req, res) => {
  const template = String(req.query.template || '');
  const columns = String(req.query.columns || '[Order Number]');
  if (!template) {
    res.status(400).json({ error: 'template query param required' });
    return;
  }
  try {
    const { PvxClient } = await import('./pvx.js');
    const pvx = new PvxClient(config.pvx);
    const { totalCount, csv } = await pvx.getReportPage({
      template,
      columns,
      pageNo: 1,
      pageSize: 10,
    });
    // Truncate the body so a huge report doesn't blow up the response.
    const preview = csv.length > 4000 ? csv.slice(0, 4000) + '\n…(truncated)' : csv;
    res.json({
      template,
      columns,
      totalCount,
      csvLength: csv.length,
      csvPreview: preview,
    });
  } catch (e) {
    console.error('[debug/pvx-report] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/orders/progress', async (_req, res) => {
  const configured = Boolean(config.pvx.openOrdersTemplate);
  try {
    // Current open count (singleton)
    const stateRes = await pool.query(
      `SELECT open_count, updated_at FROM order_state WHERE id = 1`,
    );
    const state = stateRes.rows[0] || null;

    // Today's baseline (warehouse-local date)
    const baselineRes = await pool.query(
      `SELECT day, baseline_count, captured_at
         FROM order_baselines
        ORDER BY day DESC
        LIMIT 1`,
    );
    const baseline = baselineRes.rows[0] || null;

    // Bonus context — total units (items) shipped across all pickers
    // today, summed from the User activity report. Same unit as the
    // per-picker leaderboard rows ("Anita: 140 items"), so the team
    // total reads as a clean roll-up of the individual numbers.
    // Still a different unit from the bar's morning-line-clearance,
    // but at least it's apples-to-apples with the rest of the screen.
    const despatchRes = await pool.query(
      `SELECT COALESCE(SUM(items_despatched), 0)::int AS total
         FROM pick_user_totals
        WHERE window_key = 'today'`,
    );
    const despatchedToday = despatchRes.rows[0]?.total || 0;

    // Bar math stays in one unit: count cleared = baseline - currentOpen.
    // Caveat: new orders coming in during the day make this an under-
    // estimate of "what the floor actually shipped", but it tracks the
    // morning workload honestly.
    const baselineCount = baseline?.baseline_count || 0;
    const morningCleared = baseline && state
      ? Math.max(0, baselineCount - state.open_count)
      : 0;
    const percent = baselineCount > 0
      ? Math.min(100, Math.round((morningCleared / baselineCount) * 1000) / 10)
      : 0;

    res.set('Cache-Control', 'no-store');
    res.json({
      configured,
      baseline: baseline
        ? { day: baseline.day, count: baseline.baseline_count, capturedAt: baseline.captured_at }
        : null,
      currentOpen: state?.open_count ?? null,
      currentOpenAt: state?.updated_at ?? null,
      morningCleared,
      despatchedToday,
      percent,
    });
  } catch (e) {
    console.error('[api/orders/progress] error:', e);
    res.status(500).json({ error: e.message });
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
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  const template = config.pvx.pickTemplates?.[windowKey] || '';
  const configured = Boolean(template);

  try {
    const r = await pool.query(
      `SELECT picker,
              picks_completed, items_picked, items_skipped,
              containers_moved, item_movements, items_moved,
              orders_despatched, packages_despatched, items_despatched,
              updated_at
         FROM pick_user_totals
        WHERE window_key = $1
        ORDER BY items_picked DESC, items_despatched DESC
        LIMIT $2`,
      [windowKey, limit],
    );
    const latest = r.rows.length
      ? r.rows.reduce((max, row) => (row.updated_at > max ? row.updated_at : max), r.rows[0].updated_at)
      : null;
    res.set('Cache-Control', 'no-store');
    res.json({
      window: windowKey,
      configured,
      template: template || null,
      rows: r.rows,
      totalRows: r.rows.length,
      latest,
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
