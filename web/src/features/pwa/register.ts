// Service-worker bootstrap. Imported once from main.tsx so the SW
// registers as soon as the app loads. Idempotent.

export function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return // skip in dev — Vite already handles HMR

  // Defer until the page is idle so we don't compete with first paint
  const start = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        console.warn('[sw] registration failed:', err)
      })
  }

  if (document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}
