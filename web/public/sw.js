// Service worker — caches the React app shell so the UI loads instantly
// on repeat visits and works offline (showing last-good inventory).
//
// Strategy:
//   • Versioned cache name so deploys invalidate cleanly.
//   • Pre-cache the shell on install (index + icon + manifest).
//   • Network-first for /api/inventory + /api/sync-status so live data
//     wins but we cache the last good response as an offline fallback.
//   • Stale-while-revalidate for static assets (CSS/JS/SVG) since they
//     have content-hashed filenames.

const VERSION = 'v3'
const SHELL_CACHE = `vw-shell-${VERSION}`
const DATA_CACHE = `vw-data-${VERSION}`

const SHELL = ['/', '/index.html', '/icon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Live data — network first, fall back to cached last-good
  if (url.pathname === '/api/inventory' || url.pathname === '/api/sync-status') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(DATA_CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((m) => m || new Response('[]', { status: 503 }))),
    )
    return
  }

  // Don't cache any other API calls
  if (url.pathname.startsWith('/api/')) return

  // Shell + static assets — cache first, update in background
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // Only cache successful responses
          if (res && res.status === 200) {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached || new Response('Offline', { status: 503 }))
      return cached || network
    }),
  )
})
