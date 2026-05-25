// Magic-link sign-in modal + signed-in user chip + audit log peek.
// Layout edits are gated server-side; this UI shows a "Sign in to edit" state
// instead of letting users push to a 401.
(() => {
  const STORAGE_KEY = 'vw.lastEmail';
  let currentUser = null;

  // --- Topbar slot ---------------------------------------------------------
  const topbarActions = document.querySelector('.topbar-actions');
  if (!topbarActions) return;
  const authChip = document.createElement('div');
  authChip.className = 'auth-chip';
  topbarActions.insertBefore(authChip, topbarActions.firstChild);

  // --- Modal ---------------------------------------------------------------
  const modal = document.createElement('div');
  modal.className = 'auth-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="auth-modal__backdrop" data-close></div>
    <div class="auth-modal__panel" role="dialog" aria-labelledby="authModalTitle">
      <button type="button" class="auth-modal__close" data-close aria-label="Close">×</button>
      <h2 id="authModalTitle" class="auth-modal__title">Sign in</h2>
      <p class="auth-modal__intro">Enter your email and we'll send you a one-time sign-in link.</p>
      <form class="auth-modal__form">
        <label class="auth-modal__label">
          Email
          <input type="email" name="email" required autocomplete="email" placeholder="you@example.com">
        </label>
        <button type="submit" class="primary-button auth-modal__submit">Send sign-in link</button>
      </form>
      <div class="auth-modal__status" hidden></div>
    </div>
  `;
  document.body.appendChild(modal);

  const emailInput = modal.querySelector('input[name="email"]');
  const submitBtn = modal.querySelector('.auth-modal__submit');
  const statusEl = modal.querySelector('.auth-modal__status');
  const form = modal.querySelector('.auth-modal__form');

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    try {
      const res = await fetch('./api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      localStorage.setItem(STORAGE_KEY, email);
      statusEl.hidden = false;
      if (body.delivery === 'logged') {
        statusEl.innerHTML = `<strong>Email not configured.</strong> The sign-in link was printed to the server logs (Railway → service → Logs). Check there and click the link.`;
        statusEl.className = 'auth-modal__status auth-modal__status--warn';
      } else {
        statusEl.innerHTML = `Check your inbox at <strong>${escapeHtml(email)}</strong> for a sign-in link. It expires in 15 minutes.`;
        statusEl.className = 'auth-modal__status auth-modal__status--ok';
      }
      submitBtn.textContent = 'Send another link';
    } catch (err) {
      statusEl.hidden = false;
      statusEl.className = 'auth-modal__status auth-modal__status--error';
      statusEl.textContent = `Could not send link: ${err.message}`;
      submitBtn.textContent = 'Try again';
    } finally {
      submitBtn.disabled = false;
    }
  });

  function openModal() {
    modal.hidden = false;
    emailInput.value = localStorage.getItem(STORAGE_KEY) || '';
    setTimeout(() => emailInput.focus(), 50);
    document.body.classList.add('auth-modal-open');
  }
  function closeModal() {
    modal.hidden = true;
    statusEl.hidden = true;
    submitBtn.textContent = 'Send sign-in link';
    document.body.classList.remove('auth-modal-open');
  }

  // --- Wire up authentication state ----------------------------------------
  fetchMe();

  async function fetchMe() {
    try {
      const res = await fetch('./api/auth/me', { credentials: 'same-origin' });
      const body = await res.json();
      applyUser(body.user);
    } catch (_) {
      applyUser(null);
    }
  }

  function applyUser(user) {
    currentUser = user;
    document.body.classList.toggle('is-signed-in', !!user);
    document.body.classList.toggle('is-signed-out', !user);
    renderChip();
  }

  function renderChip() {
    if (currentUser) {
      const initial = currentUser.email.charAt(0).toUpperCase();
      authChip.innerHTML = `
        <button type="button" class="auth-chip__user" data-action="menu" title="${escapeAttr(currentUser.email)}">
          <span class="auth-chip__avatar">${escapeHtml(initial)}</span>
          <span class="auth-chip__email">${escapeHtml(shortenEmail(currentUser.email))}</span>
        </button>
        <div class="auth-chip__menu" hidden>
          <div class="auth-chip__menu-email">${escapeHtml(currentUser.email)}</div>
          <button type="button" data-action="audit" class="auth-chip__menu-item">View audit log</button>
          <button type="button" data-action="logout" class="auth-chip__menu-item auth-chip__menu-item--danger">Sign out</button>
        </div>
      `;
    } else {
      authChip.innerHTML = `
        <button type="button" class="auth-chip__signin utility-button" data-action="signin">Sign in</button>
      `;
    }
  }

  authChip.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'signin') {
      openModal();
    } else if (action === 'menu') {
      const menu = authChip.querySelector('.auth-chip__menu');
      if (menu) menu.hidden = !menu.hidden;
    } else if (action === 'logout') {
      await fetch('./api/auth/logout', { method: 'POST' });
      window.location.reload();
    } else if (action === 'audit') {
      openAuditLog();
    }
  });

  document.addEventListener('click', (e) => {
    if (!authChip.contains(e.target)) {
      const menu = authChip.querySelector('.auth-chip__menu');
      if (menu) menu.hidden = true;
    }
  });

  // --- Audit log view ------------------------------------------------------
  async function openAuditLog() {
    const wrap = document.createElement('div');
    wrap.className = 'audit-modal';
    wrap.innerHTML = `
      <div class="audit-modal__backdrop" data-close></div>
      <div class="audit-modal__panel">
        <button type="button" class="audit-modal__close" data-close aria-label="Close">×</button>
        <h2 class="audit-modal__title">Audit log</h2>
        <div class="audit-modal__body">Loading…</div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) wrap.remove();
    });

    try {
      const res = await fetch('./api/audit?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const rows = body.entries || [];
      const html = rows.length
        ? rows
            .map(
              (r) => `
            <tr>
              <td>${formatTime(r.created_at)}</td>
              <td>${escapeHtml(r.user_email || '—')}</td>
              <td><code>${escapeHtml(r.action)}</code></td>
              <td><code class="audit-payload">${escapeHtml(JSON.stringify(r.payload || {}))}</code></td>
            </tr>
          `,
            )
            .join('')
        : `<tr><td colspan="4" class="no-results">No audit entries yet.</td></tr>`;
      wrap.querySelector('.audit-modal__body').innerHTML = `
        <table class="audit-table">
          <thead>
            <tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr>
          </thead>
          <tbody>${html}</tbody>
        </table>
      `;
    } catch (e) {
      wrap.querySelector('.audit-modal__body').innerHTML =
        `<p class="audit-error">Could not load audit log: ${escapeHtml(e.message)}</p>`;
    }
  }

  // --- Helpers --------------------------------------------------------------
  function shortenEmail(e) {
    if (e.length <= 24) return e;
    const [name, domain] = e.split('@');
    return `${name.slice(0, 10)}…@${domain}`;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
  function formatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch (_) {
      return iso;
    }
  }
})();
