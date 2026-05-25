// Dashboard KPI cards. Reads from window.WAREHOUSE_DATA and renders a row
// of summary stats above the existing inventory tables.
(() => {
  const host = document.getElementById('kpiRow');
  if (!host) return;

  function num(n) {
    return Number(n || 0).toLocaleString();
  }

  function compute() {
    const D = window.WAREHOUSE_DATA || {};
    const grid = D.grid || {};
    const other = D.other || [];
    const skus = D.skus || {};
    const aisleBays = D.aisleBays || {};
    const levels = D.levels || 7;
    const slotsPerLane = D.slots || 7;

    // Total layout slots: sum(bays per aisle) * levels * slotsPerLane
    let totalSlots = 0;
    for (const k of Object.keys(aisleBays)) {
      totalSlots += (aisleBays[k] || 0) * levels * slotsPerLane;
    }

    // Stocked slots = grid keys with any qty
    let stockedSlots = 0;
    let totalUnits = 0;
    const lowStockSkus = new Set();
    const emptySkus = new Set(Object.keys(skus));

    for (const [code, entries] of Object.entries(grid)) {
      let slotQty = 0;
      for (const [sku, qty] of entries) {
        const q = Number(qty) || 0;
        slotQty += q;
        totalUnits += q;
        emptySkus.delete(sku);
        if (q > 0 && q <= 5) lowStockSkus.add(sku);
      }
      if (slotQty > 0) stockedSlots += 1;
    }
    for (const row of other) {
      const sku = row[1];
      const qty = Number(row[2]) || 0;
      totalUnits += qty;
      emptySkus.delete(sku);
      if (qty > 0 && qty <= 5) lowStockSkus.add(sku);
    }

    const fullnessPct = totalSlots > 0 ? Math.round((stockedSlots / totalSlots) * 100) : 0;
    const emptySlots = Math.max(0, totalSlots - stockedSlots);

    // Empty bays — for each aisle/bay, all slots empty?
    let emptyBays = 0;
    for (const [aisleKey, bayCount] of Object.entries(aisleBays)) {
      const aisleId = `A${String(aisleKey).padStart(2, '0')}`;
      for (let b = 1; b <= bayCount; b++) {
        const bayPrefix = `${aisleId}.B${String(b).padStart(2, '0')}.`;
        let hasStock = false;
        // Check if any grid key under this bay has stock
        // (linear scan is fine for ~6500 keys × ~210 bays)
        for (const code of Object.keys(grid)) {
          if (code.startsWith(bayPrefix)) {
            hasStock = true;
            break;
          }
        }
        if (!hasStock) emptyBays += 1;
      }
    }

    return {
      totalUnits,
      distinctSkus: Object.keys(skus).length,
      fullnessPct,
      stockedSlots,
      totalSlots,
      emptySlots,
      emptyBays,
      lowStockCount: lowStockSkus.size,
      zeroStockCount: emptySkus.size,
    };
  }

  function render() {
    const k = compute();
    host.innerHTML = `
      <article class="kpi-card kpi-card--primary">
        <div class="kpi-card__label">Units in stock</div>
        <div class="kpi-card__value">${num(k.totalUnits)}</div>
        <div class="kpi-card__sub">${num(k.distinctSkus)} distinct SKUs</div>
      </article>
      <article class="kpi-card">
        <div class="kpi-card__label">Bin fullness</div>
        <div class="kpi-card__value">${k.fullnessPct}<span class="kpi-card__unit">%</span></div>
        <div class="kpi-card__sub">${num(k.stockedSlots)} of ${num(k.totalSlots)} slots</div>
        <div class="kpi-card__bar"><i style="width:${k.fullnessPct}%"></i></div>
      </article>
      <article class="kpi-card">
        <div class="kpi-card__label">Empty slots</div>
        <div class="kpi-card__value">${num(k.emptySlots)}</div>
        <div class="kpi-card__sub">${num(k.emptyBays)} fully empty bays</div>
      </article>
      <article class="kpi-card kpi-card--warn">
        <div class="kpi-card__label">Low stock SKUs</div>
        <div class="kpi-card__value">${num(k.lowStockCount)}</div>
        <div class="kpi-card__sub">1&ndash;5 units somewhere</div>
      </article>
      <article class="kpi-card kpi-card--alert">
        <div class="kpi-card__label">Out of stock</div>
        <div class="kpi-card__value">${num(k.zeroStockCount)}</div>
        <div class="kpi-card__sub">SKUs at zero across the warehouse</div>
      </article>
    `;
  }

  render();

  // Re-render whenever the visualiser re-renders (covers post-sync data loads)
  let renderRaf = null;
  const obs = new MutationObserver(() => {
    if (renderRaf) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      // Only re-render when WAREHOUSE_DATA seems to have changed materially
      const D = window.WAREHOUSE_DATA;
      const sig = `${D?.rowCount}|${D?.generatedAt}`;
      if (sig === host.dataset.sig) return;
      host.dataset.sig = sig;
      render();
    });
  });
  obs.observe(document.querySelector('.main-panel') || document.body, {
    subtree: true,
    childList: true,
  });
})();
