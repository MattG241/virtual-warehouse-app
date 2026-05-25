// Loads warehouse data from /api/inventory (live PVX snapshot) and falls back
// to the static inventory.js bundle if the API is unreachable (eg. GitHub
// Pages deploy with no backend). Then loads app.js once WAREHOUSE_DATA is set.

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    // async defaults to true for dynamically-inserted scripts, which lets them
    // execute out of order. We chain via await, but force it false anyway so
    // each script runs to completion in document order.
    s.async = false;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

async function fetchLiveData() {
  const res = await fetch('./api/inventory', { cache: 'no-store' });
  if (!res.ok) throw new Error(`/api/inventory returned HTTP ${res.status}`);
  return res.json();
}

try {
  const data = await fetchLiveData();
  window.WAREHOUSE_DATA = data;
  console.log(
    `[bootstrap] live data loaded — ${data.rowCount} rows, synced ${data.generatedAt || 'unknown'}`,
  );
} catch (err) {
  console.warn('[bootstrap] live API unavailable, falling back to static inventory.js:', err.message);
  await loadScript('./inventory.js');
}

await loadScript('./live-updates.js');
await loadScript('./auth-ui.js');
await loadScript('./app.js');
await loadScript('./sync-ui.js');
await loadScript('./search-ui.js');
