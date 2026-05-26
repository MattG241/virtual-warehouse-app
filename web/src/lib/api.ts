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

export async function registerUser(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'web' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'registration failed')
  }
  return res.json()
}

export interface LayoutDoc {
  aisles: LayoutAisle[]
  dataVersion?: string
}

export interface LayoutAisle {
  id: string
  name?: string
  zone?: string
  bays: LayoutBay[]
}

export interface LayoutBay {
  id: string
  side: 'left' | 'right'
  lanes: { id: string; slots: { id: string }[] }[]
}

export async function fetchLayout(): Promise<LayoutDoc | null> {
  const res = await fetch(`${BASE}/api/layout`, { credentials: 'include' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`/api/layout ${res.status}`)
  const data = await res.json()
  return data.layout
}

export async function saveLayout(layout: LayoutDoc) {
  const res = await fetch(`${BASE}/api/layout`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'web' },
    credentials: 'include',
    body: JSON.stringify(layout),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `/api/layout PUT ${res.status}`)
  }
  return res.json()
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

export type LeaderboardWindow = 'today' | 'week' | 'month'

export interface LeaderboardRow {
  picker: string
  picks_completed: number
  items_picked: number
  items_skipped: number
  containers_moved: number
  item_movements: number
  items_moved: number
  orders_despatched: number
  packages_despatched: number
  items_despatched: number
  updated_at: string
}

export interface LeaderboardResponse {
  window: LeaderboardWindow
  configured: boolean
  template: string | null
  rows: LeaderboardRow[]
  totalRows: number
  latest: string | null
}

export interface OrdersProgress {
  configured: boolean
  baseline: { day: string; count: number; capturedAt: string } | null
  currentOpen: number | null
  currentOpenAt: string | null
  despatchedToday: number
  percent: number
}

/** Returns null if the backend has no orders/progress endpoint. */
export async function fetchOrdersProgress(signal?: AbortSignal): Promise<OrdersProgress | null> {
  const res = await fetch(`${BASE}/api/orders/progress`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`/api/orders/progress ${res.status}`)
  return res.json()
}

/** Returns null if the backend has no leaderboard endpoint (e.g. older deploys). */
export async function fetchLeaderboard(
  win: LeaderboardWindow,
  signal?: AbortSignal,
): Promise<LeaderboardResponse | null> {
  const res = await fetch(
    `${BASE}/api/leaderboard?window=${encodeURIComponent(win)}&limit=20`,
    { credentials: 'include', cache: 'no-store', signal },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`/api/leaderboard ${res.status}`)
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
