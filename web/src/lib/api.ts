import type { Inventory } from './types'

const BASE = ''

export async function fetchInventory(): Promise<Inventory> {
  const res = await fetch(`${BASE}/api/inventory`, { credentials: 'include' })
  if (!res.ok) throw new Error(`/api/inventory ${res.status}`)
  return res.json()
}

export interface User {
  email: string
}

export async function fetchMe(): Promise<User | null> {
  const res = await fetch(`${BASE}/api/auth/me`, { credentials: 'include' })
  if (!res.ok) return null
  const data = await res.json()
  return data.user ?? null
}

export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'web' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'sign-in failed')
  }
  return res.json()
}

export async function logout() {
  await fetch(`${BASE}/api/auth/logout`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'web' },
    credentials: 'include',
  })
}

export async function syncNow() {
  const res = await fetch(`${BASE}/api/sync-now`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'web' },
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`sync-now ${res.status}`)
  return res.json()
}

export interface SyncRun {
  id: number
  started_at: string
  finished_at: string | null
  row_count: number
  status: string
  error_text: string | null
}

export async function fetchSyncStatus(): Promise<{ runs: SyncRun[] }> {
  const res = await fetch(`${BASE}/api/sync-status`, { credentials: 'include' })
  if (!res.ok) return { runs: [] }
  return res.json()
}

/** Opens an EventSource to /api/events. Returns a cleanup function. */
export function openEvents(handlers: {
  onSyncCompleted?: (e: { rowCount: number; finishedAt: string }) => void
  onLayoutUpdated?: () => void
  onError?: () => void
}) {
  const es = new EventSource(`${BASE}/api/events`, { withCredentials: true })
  let closed = false
  let retryMs = 1000

  es.addEventListener('sync.completed', (ev) => {
    retryMs = 1000
    try {
      handlers.onSyncCompleted?.(JSON.parse((ev as MessageEvent).data))
    } catch {
      /* noop */
    }
  })
  es.addEventListener('layout.updated', () => handlers.onLayoutUpdated?.())
  es.onerror = () => {
    handlers.onError?.()
    // EventSource auto-reconnects on transient drops. Close + reopen on
    // anything that pushes readyState to CLOSED so we don't spin in CONNECTING.
    if (es.readyState === EventSource.CLOSED && !closed) {
      setTimeout(() => {
        if (!closed) openEvents(handlers)
      }, Math.min(retryMs *= 2, 30_000))
    }
  }

  return () => {
    closed = true
    es.close()
  }
}
