// Recent SKU / location memory — persisted to localStorage so the
// search overlay can surface common picks before the user types.

const KEY = 'vw.recentSearches'
const MAX = 8

export interface RecentEntry {
  kind: 'sku' | 'location'
  /** SKU code or full location code. */
  value: string
  /** Friendly label cached at the time of save (SKU name etc.). */
  label?: string
  at: number
}

export function getRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

export function pushRecent(entry: Omit<RecentEntry, 'at'>) {
  const list = getRecent().filter((e) => e.value !== entry.value)
  list.unshift({ ...entry, at: Date.now() })
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* noop */
  }
}

export function clearRecent() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* noop */
  }
}
