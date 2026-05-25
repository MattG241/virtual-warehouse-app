// Small "Export" button in the topbar with a popover listing downloadable
// CSV reports. Files stream from the server and Excel-compatible (UTF-8 BOM).
(() => {
  const topbarActions = document.querySelector('.topbar-actions');
  if (!topbarActions) return;

  const wrap = document.createElement('div');
  wrap.className = 'export-menu';
  wrap.innerHTML = `
    <button type="button" class="icon-button export-menu__btn" data-action="toggle" title="Download stock data as CSV" aria-label="Export reports">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </button>
    <div class="export-menu__panel" hidden>
      <div class="export-menu__group-label">Reports</div>
      <a class="export-menu__item" href="./api/export/snapshot.csv" download>
        <div class="export-menu__item-title">Current snapshot</div>
        <div class="export-menu__item-sub">All SKUs and locations with stock &gt; 0</div>
      </a>
      <a class="export-menu__item" href="./api/export/low-stock.csv?threshold=5" download>
        <div class="export-menu__item-title">Low stock (≤ 5 units)</div>
        <div class="export-menu__item-sub">SKU + location, sorted by quantity</div>
      </a>
      <a class="export-menu__item" href="./api/export/zero-stock-items.csv" download>
        <div class="export-menu__item-title">Out-of-stock SKUs</div>
        <div class="export-menu__item-sub">Items present in the catalogue but currently 0</div>
      </a>
      <a class="export-menu__item" href="./api/export/by-aisle.csv" download>
        <div class="export-menu__item-title">Stock by aisle</div>
        <div class="export-menu__item-sub">SKU totals grouped by aisle number</div>
      </a>
    </div>
  `;

  // Slot it just before the auth chip (right side of the topbar)
  const authChip = topbarActions.querySelector('.auth-chip');
  if (authChip) {
    topbarActions.insertBefore(wrap, authChip);
  } else {
    topbarActions.appendChild(wrap);
  }

  const btn = wrap.querySelector('.export-menu__btn');
  const panel = wrap.querySelector('.export-menu__panel');

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="toggle"]')) {
      panel.hidden = !panel.hidden;
    } else if (e.target.closest('.export-menu__item')) {
      // close on download click
      panel.hidden = true;
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) panel.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') panel.hidden = true;
  });
})();
