// Manual sync controls + "last sync" indicator in the topbar.
// Wires to POST /api/sync-now and polls /api/sync-status until the run finishes.
// Wrapped in an IIFE so its top-level bindings don't collide with app.js (which
// also declares a top-level `$` in the shared classic-script scope).
(() => {
  const STATE_STORAGE_KEY = 'virtualWarehouse:v5';
  const POLL_INTERVAL_MS = 2000;
  const POLL_TIMEOUT_MS = 5 * 60 * 1000;
  const AGO_REFRESH_MS = 30 * 1000;

  const byId = (id) => document.getElementById(id);

  const els = {
    status: byId('syncStatus'),
    dot: byId('syncDot'),
    text: byId('syncText'),
    button: byId('syncNowButton'),
  };

  function rebindEls() {
    els.status = byId('syncStatus');
    els.dot = byId('syncDot');
    els.text = byId('syncText');
    els.button = byId('syncNowButton');
  }

  if (els.button) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      rebindEls();
      if (els.button) init();
    });
  }

  function init() {
    const data = window.WAREHOUSE_DATA || {};
    setLastSync(data?.syncStatus?.finishedAt || data?.generatedAt || null);
    setInterval(() => {
      const d = window.WAREHOUSE_DATA || {};
      setLastSync(d?.syncStatus?.finishedAt || d?.generatedAt || null);
    }, AGO_REFRESH_MS);
    els.button.addEventListener('click', onSyncClick);
  }

  async function onSyncClick() {
    setRunning('Syncing…');
    els.button.disabled = true;
    try {
      const triggerRes = await fetch('./api/sync-now', { method: 'POST' });
      if (!triggerRes.ok) {
        const body = await safeJson(triggerRes);
        throw new Error(body?.error || `HTTP ${triggerRes.status}`);
      }

      const run = await pollUntilDone();
      if (run.status === 'ok') {
        try {
          localStorage.removeItem(STATE_STORAGE_KEY);
        } catch (_) {
          // ignore
        }
        setRunning('Sync ok — reloading…');
        window.location.reload();
      } else {
        setError(run.error_text || 'sync failed');
        els.button.disabled = false;
      }
    } catch (err) {
      console.error('[sync-ui] sync failed:', err);
      setError(err.message || String(err));
      els.button.disabled = false;
    }
  }

  async function pollUntilDone() {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const res = await fetch('./api/sync-status', { cache: 'no-store' });
      if (!res.ok) continue;
      const body = await res.json();
      const latest = body.runs?.[0];
      if (!latest) continue;
      if (latest.status === 'ok' || latest.status === 'error') {
        return latest;
      }
    }
    throw new Error('sync timed out after 5 minutes');
  }

  function setLastSync(iso) {
    if (!els.text) return;
    if (!iso) {
      els.text.textContent = 'Last sync: never';
      els.dot.dataset.state = 'stale';
      return;
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      els.text.textContent = `Last sync: ${iso}`;
      els.dot.dataset.state = 'idle';
      return;
    }
    els.text.textContent = `Last sync: ${formatAgo(date)}`;
    els.text.title = date.toLocaleString();
    els.dot.dataset.state = ageMs(date) > 15 * 60 * 1000 ? 'stale' : 'idle';
  }

  function setRunning(label) {
    if (!els.text) return;
    els.text.textContent = label;
    els.dot.dataset.state = 'running';
  }

  function setError(msg) {
    if (!els.text) return;
    els.text.textContent = `Sync failed: ${msg}`;
    els.dot.dataset.state = 'error';
  }

  function ageMs(date) {
    return Date.now() - date.getTime();
  }

  function formatAgo(date) {
    const seconds = Math.round(ageMs(date) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return date.toLocaleString();
  }

  async function safeJson(res) {
    try {
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
})();
