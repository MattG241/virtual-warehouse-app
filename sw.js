// Minimal service worker: cache the app shell so the visualiser still renders
// when offline (showing the last fetched layout, no live API). API calls
// always go to the network — we never want to serve stale stock data.
const CACHE_NAME = 'vw-shell-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './bootstrap.js',
  './sync-ui.js',
  './search-ui.js',
  './live-updates.js',
  './auth-ui.js',
  './scanner-ui.js',
  './export-ui.js',
  './dashboard-kpis.js',
  './inventory.js',
  './icon.svg',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL).catch(() => {
        // Don't fail install if a single resource is missing during deploy.
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Never cache the API — always go to the network.
  if (url.pathname.startsWith('/api/')) return;

  // Static shell: cache-first with a network update on the side.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
