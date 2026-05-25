// Search dropdown + heatmap toggle.
// - Type a SKU, partial name, or location code → dropdown shows matches.
// - Click a SKU match → highlights every box holding it + jumps to the first.
// - Click a location → jumps straight to that bay.
// - Heatmap toggle: colour-codes every box by fullness (empty/low/healthy).
(() => {
  const MAX_SKU_RESULTS = 12;
  const MAX_LOCATION_RESULTS = 6;
  const HIGHLIGHT_CLEAR_MS = 30 * 1000;

  const input = document.getElementById('globalSearch');
  if (!input) return;

  // --- Build the results dropdown ------------------------------------------
  const wrap = input.closest('.search-field') || input.parentElement;
  wrap.classList.add('search-field--with-results');

  const panel = document.createElement('div');
  panel.className = 'search-results';
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;
  wrap.appendChild(panel);

  const chip = document.createElement('div');
  chip.className = 'search-active-chip';
  chip.hidden = true;
  wrap.appendChild(chip);

  // --- Index ----------------------------------------------------------------
  let index = null;
  function ensureIndex() {
    if (index) return index;
    const D = window.WAREHOUSE_DATA || {};
    const grid = D.grid || {};
    const other = D.other || [];
    const skus = D.skus || {};

    const skuLocations = new Map();
    const locations = new Set();

    for (const [code, entries] of Object.entries(grid)) {
      locations.add(code);
      for (const [sku, qty] of entries) {
        if (!skuLocations.has(sku)) skuLocations.set(sku, []);
        skuLocations.get(sku).push({ code, qty });
      }
    }
    for (const row of other) {
      const [loc, sku, qty] = row;
      locations.add(loc);
      if (!skuLocations.has(sku)) skuLocations.set(sku, []);
      skuLocations.get(sku).push({ code: loc, qty });
    }

    index = { skuLocations, locations: [...locations], skuMeta: skus };
    return index;
  }

  // --- Listeners ------------------------------------------------------------
  let debounceId = null;
  input.addEventListener('input', () => {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => runSearch(input.value), 80);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim()) runSearch(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (input.value || document.body.classList.contains('has-search-highlight')) {
        clearHighlight();
        input.value = '';
        hidePanel();
      } else {
        hidePanel();
        input.blur();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Enter') {
      const selected = panel.querySelector('[data-action].is-selected') ||
        panel.querySelector('[data-action]');
      if (selected) {
        e.preventDefault();
        selected.click();
      }
    }
  });

  function moveSelection(direction) {
    const items = Array.from(panel.querySelectorAll('[data-action]'));
    if (!items.length) return;
    const idx = items.findIndex((el) => el.classList.contains('is-selected'));
    let next = idx + direction;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items.forEach((el, i) => el.classList.toggle('is-selected', i === next));
    items[next].scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) hidePanel();
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'sku') {
      pickSku(btn.dataset.sku);
    } else if (btn.dataset.action === 'location') {
      pickLocation(btn.dataset.code);
    }
  });

  chip.addEventListener('click', (e) => {
    if (e.target.closest('.search-active-clear')) {
      clearHighlight();
    }
  });

  // --- Search execution -----------------------------------------------------
  function runSearch(rawQuery) {
    const q = rawQuery.trim();
    if (!q) {
      hidePanel();
      return;
    }
    const idx = ensureIndex();
    const qLow = q.toLowerCase();

    const skuMatches = [];
    for (const [sku, meta] of Object.entries(idx.skuMeta)) {
      const name = (meta && meta[0]) || '';
      const skuLow = sku.toLowerCase();
      const nameLow = name.toLowerCase();
      let score = 0;
      if (skuLow === qLow) score = 1000;
      else if (skuLow.startsWith(qLow)) score = 700;
      else if (nameLow === qLow) score = 600;
      else if (nameLow.startsWith(qLow)) score = 500;
      else if (skuLow.includes(qLow)) score = 300;
      else if (nameLow.includes(qLow)) score = 200;
      if (score > 0) {
        const locs = idx.skuLocations.get(sku) || [];
        const total = locs.reduce((a, b) => a + (Number(b.qty) || 0), 0);
        skuMatches.push({ sku, name, locations: locs, total, score });
      }
    }
    // Sort by relevance score first, then by total stock as a tie-breaker so
    // common items rank above near-empties when both are exact prefix matches.
    skuMatches.sort((a, b) => b.score - a.score || b.total - a.total);
    skuMatches.length = Math.min(skuMatches.length, MAX_SKU_RESULTS);

    const locMatches = idx.locations
      .filter((c) => c.toLowerCase().includes(qLow))
      .slice(0, MAX_LOCATION_RESULTS);

    renderPanel(q, skuMatches, locMatches);
  }

  function renderPanel(query, skuMatches, locMatches) {
    if (!skuMatches.length && !locMatches.length) {
      panel.innerHTML = `<div class="search-empty">No SKUs or locations matching <strong>${escapeHtml(query)}</strong>.</div>`;
      showPanel();
      return;
    }
    const parts = [];
    if (skuMatches.length) {
      parts.push(`<div class="search-group-label">SKUs (${skuMatches.length})</div>`);
      for (const m of skuMatches.slice(0, MAX_SKU_RESULTS)) {
        const locCount = m.locations.length;
        const suffix = locCount === 1 ? 'location' : 'locations';
        parts.push(`
          <button type="button" class="search-result" data-action="sku" data-sku="${escapeAttr(m.sku)}">
            <div class="search-result__title">${escapeHtml(m.sku)}</div>
            <div class="search-result__meta">${escapeHtml(m.name || '—')} · ${formatNum(m.total)} units · ${locCount} ${suffix}</div>
          </button>
        `);
      }
    }
    if (locMatches.length) {
      parts.push(`<div class="search-group-label">Locations (${locMatches.length})</div>`);
      for (const code of locMatches.slice(0, MAX_LOCATION_RESULTS)) {
        parts.push(`
          <button type="button" class="search-result" data-action="location" data-code="${escapeAttr(code)}">
            <div class="search-result__title">${escapeHtml(code)}</div>
          </button>
        `);
      }
    }
    panel.innerHTML = parts.join('');
    showPanel();
  }

  function showPanel() {
    panel.hidden = false;
  }
  function hidePanel() {
    panel.hidden = true;
  }

  // --- Highlight + jump -----------------------------------------------------
  let highlightClearId = null;

  function pickSku(sku) {
    const idx = ensureIndex();
    const locs = idx.skuLocations.get(sku) || [];
    if (!locs.length) {
      hidePanel();
      return;
    }
    setActiveChip(sku, locs.length);
    document.body.dataset.searchSku = sku;
    document.body.classList.add('has-search-highlight');
    applyBoxHighlight(locs.map((l) => l.code));
    jumpToCode(locs[0].code);
    hidePanel();
    input.value = sku;
    scheduleClear();
  }

  function pickLocation(code) {
    document.body.classList.add('has-search-highlight');
    applyBoxHighlight([code]);
    setActiveChip(code, 1);
    jumpToCode(code);
    hidePanel();
    input.value = code;
    scheduleClear();
  }

  function scheduleClear() {
    if (highlightClearId) clearTimeout(highlightClearId);
    highlightClearId = setTimeout(clearHighlight, HIGHLIGHT_CLEAR_MS);
  }

  function clearHighlight() {
    if (highlightClearId) clearTimeout(highlightClearId);
    document.body.classList.remove('has-search-highlight');
    delete document.body.dataset.searchSku;
    document
      .querySelectorAll('.search-hit')
      .forEach((el) => el.classList.remove('search-hit'));
    chip.hidden = true;
    input.value = '';
  }

  function applyBoxHighlight(codes) {
    document.querySelectorAll('.search-hit').forEach((el) => el.classList.remove('search-hit'));
    const set = new Set(codes);
    document.querySelectorAll('[data-code]').forEach((el) => {
      if (set.has(el.dataset.code)) el.classList.add('search-hit');
    });
    // Re-apply when the visualiser re-renders (it nukes the DOM on every render).
    if (!window.__searchHighlightObserverInstalled) {
      window.__searchHighlightObserverInstalled = true;
      const obs = new MutationObserver(() => {
        if (!document.body.classList.contains('has-search-highlight')) return;
        const codes = window.__searchHighlightCodes;
        if (!codes) return;
        const set2 = new Set(codes);
        document.querySelectorAll('[data-code]').forEach((el) => {
          if (set2.has(el.dataset.code)) el.classList.add('search-hit');
        });
      });
      const target = document.querySelector('.main-panel') || document.body;
      obs.observe(target, { subtree: true, childList: true });
    }
    window.__searchHighlightCodes = codes;
  }

  function jumpToCode(code) {
    const m = /^A0*(\d+)\.B0*(\d+)/i.exec(code);
    if (!m) return;
    const aisleId = `A${String(m[1]).padStart(2, '0')}`;
    const bayId = `B${String(m[2]).padStart(2, '0')}`;

    // 1. Switch to walkthrough view if we aren't on it
    const walkthroughNav = document.querySelector('[data-view="walkthrough"]');
    if (walkthroughNav && !walkthroughNav.classList.contains('active')) {
      walkthroughNav.click();
    }

    // 2. Force overview mode so the data-aisle-id buttons exist in warehouse3d.
    //    app.js only re-renders the warehouse3d hierarchy on mode change.
    const overviewBtn = document.querySelector('[data-warehouse-mode="overview"]');
    overviewBtn?.click();

    // Chain through the hierarchy: click in warehouse3d at each level so
    // app.js bumps warehouseMode to "aisle" → "row" → "box" along the way.
    const tryClick = (selector) => {
      const el = document.querySelector(selector);
      if (el) {
        el.click();
        return true;
      }
      return false;
    };

    setTimeout(() => {
      // 3. Aisle: click in warehouse3d (not the strip — that doesn't change mode)
      if (!tryClick(`#warehouse3d [data-aisle-id="${cssEscape(aisleId)}"]`)) {
        // Fall back to the strip button just to highlight the aisle even if we
        // can't drill in.
        const stripBtn = Array.from(document.querySelectorAll('#aisleSelector button')).find(
          (b) => b.textContent.trim() === aisleId,
        );
        stripBtn?.click();
      }

      setTimeout(() => {
        // 4. Bay → bumps to "row" mode
        tryClick(`#warehouse3d [data-bay-id="${cssEscape(bayId)}"]`);

        setTimeout(() => {
          // 5. Slot → final selection + scroll into view
          const target = document.querySelector(`[data-code="${cssEscape(code)}"]`);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.click();
          } else {
            document
              .querySelector('.search-hit')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 240);
      }, 240);
    }, 220);
  }

  function setActiveChip(label, locCount) {
    chip.innerHTML = `
      <span class="search-active-label">Showing: <strong>${escapeHtml(label)}</strong>${
        locCount > 1 ? ` <em>(${locCount} locations)</em>` : ''
      }</span>
      <button type="button" class="search-active-clear" aria-label="Clear">×</button>
    `;
    chip.hidden = false;
  }

  // --- Heatmap toggle -------------------------------------------------------
  function installHeatmapToggle() {
    const tail = document.querySelector('#walkthroughView .toolbar-tail');
    const reference = document.getElementById('emptyHighlightButton');
    if (!tail || !reference || document.getElementById('heatmapToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'heatmapToggle';
    btn.className = 'utility-button heatmap-toggle';
    btn.type = 'button';
    btn.title = 'Colour every box by fullness';
    btn.textContent = 'Heatmap';
    reference.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', () => {
      const on = document.body.classList.toggle('heatmap-mode');
      btn.classList.toggle('active', on);
    });
  }
  installHeatmapToggle();
  document.addEventListener('DOMContentLoaded', installHeatmapToggle);

  // --- Helpers --------------------------------------------------------------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/(["\\.\s])/g, '\\$1');
  }
  function formatNum(n) {
    return Number(n || 0).toLocaleString();
  }
})();
