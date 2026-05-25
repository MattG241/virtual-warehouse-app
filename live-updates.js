// Live cross-browser updates via SSE. Listens to /api/events and surfaces
// toasts when stock data or layout changes. Avoids self-echo by tagging
// outbound PUTs with X-Client-Id (set on window so app.js picks it up).
(() => {
  if (!('EventSource' in window)) return;

  const clientId =
    (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.__clientId = clientId;

  // --- Toast container ------------------------------------------------------
  let toastHost = document.getElementById('toastHost');
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.id = 'toastHost';
    toastHost.className = 'toast-host';
    document.body.appendChild(toastHost);
  }

  function showToast({ kind = 'info', title, body, action }) {
    const t = document.createElement('div');
    t.className = `toast toast--${kind}`;
    t.innerHTML = `
      <div class="toast-body">
        <div class="toast-title"></div>
        <div class="toast-text"></div>
      </div>
      <div class="toast-actions"></div>
    `;
    t.querySelector('.toast-title').textContent = title || '';
    t.querySelector('.toast-text').textContent = body || '';
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick();
        dismiss();
      });
      t.querySelector('.toast-actions').appendChild(btn);
    }
    const closer = document.createElement('button');
    closer.type = 'button';
    closer.className = 'toast-close';
    closer.setAttribute('aria-label', 'Dismiss');
    closer.textContent = '×';
    closer.addEventListener('click', dismiss);
    t.querySelector('.toast-actions').appendChild(closer);

    function dismiss() {
      t.classList.add('toast--leaving');
      setTimeout(() => t.remove(), 200);
    }
    setTimeout(dismiss, action ? 10000 : 4500);

    toastHost.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast--entered'));
    return { dismiss };
  }

  // --- SSE connection -------------------------------------------------------
  let es = null;
  let reconnectAttempt = 0;

  function connect() {
    es = new EventSource('./api/events');
    es.addEventListener('open', () => {
      reconnectAttempt = 0;
    });
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        scheduleReconnect();
      }
    });

    es.addEventListener('connected', () => {
      console.log('[live] SSE connected');
    });

    es.addEventListener('sync.started', () => {
      updateSyncDot('running', 'Syncing…');
    });

    es.addEventListener('sync.completed', (ev) => {
      const data = parse(ev.data);
      updateSyncDot('idle', `Last sync: just now`);
      // Keep the sync-ui.js indicator's tooltip date in sync if WAREHOUSE_DATA exists
      if (window.WAREHOUSE_DATA && data?.finishedAt) {
        window.WAREHOUSE_DATA.generatedAt = data.finishedAt;
        if (window.WAREHOUSE_DATA.syncStatus) {
          window.WAREHOUSE_DATA.syncStatus.finishedAt = data.finishedAt;
          if (typeof data.rowCount === 'number') {
            window.WAREHOUSE_DATA.syncStatus.rowCount = data.rowCount;
          }
        }
      }
      showToast({
        kind: 'success',
        title: 'Inventory updated',
        body: `Fresh snapshot from Peoplevox · ${formatNumber(data?.rowCount)} rows`,
        action: { label: 'Refresh now', onClick: () => location.reload() },
      });
    });

    es.addEventListener('sync.failed', (ev) => {
      const data = parse(ev.data);
      showToast({
        kind: 'error',
        title: 'Sync failed',
        body: data?.error || 'Unknown error from Peoplevox',
      });
    });

    es.addEventListener('layout.updated', (ev) => {
      const data = parse(ev.data);
      if (data?.clientId === clientId) return; // our own change, ignore
      showToast({
        kind: 'info',
        title: 'Warehouse layout changed',
        body: 'Another user updated the warehouse structure.',
        action: { label: 'Reload', onClick: () => location.reload() },
      });
    });
  }

  function scheduleReconnect() {
    if (es) {
      es.close();
      es = null;
    }
    const delay = Math.min(30000, 1000 * Math.pow(2, reconnectAttempt));
    reconnectAttempt += 1;
    setTimeout(connect, delay);
  }

  function updateSyncDot(state, text) {
    const dot = document.getElementById('syncDot');
    const label = document.getElementById('syncText');
    if (dot) dot.dataset.state = state;
    if (label && text) label.textContent = text;
  }

  function parse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString();
  }

  connect();
})();
