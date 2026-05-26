import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WidgetKey =
  | 'kpis'
  | 'lowStock'
  | 'topSkus'
  | 'aisleHealth'
  | 'syncHistory'
  | 'leaderboard'

export interface Widget {
  key: WidgetKey
  label: string
  visible: boolean
}

export const defaultWidgets: Widget[] = [
  { key: 'kpis', label: 'KPI strip', visible: true },
  { key: 'lowStock', label: 'Low stock alerts', visible: true },
  { key: 'topSkus', label: 'Top SKUs by units', visible: true },
  { key: 'aisleHealth', label: 'Aisle health', visible: true },
  { key: 'leaderboard', label: 'Picker leaderboard', visible: true },
  { key: 'syncHistory', label: 'Sync history', visible: true },
]

interface DashboardState {
  widgets: Widget[]
  toggle: (key: WidgetKey) => void
  move: (key: WidgetKey, direction: -1 | 1) => void
  reset: () => void
}

export const useDashboard = create<DashboardState>()(
  persist(
    (set) => ({
      widgets: defaultWidgets,
      toggle: (key) =>
        set((s) => ({
          widgets: s.widgets.map((w) =>
            w.key === key ? { ...w, visible: !w.visible } : w,
          ),
        })),
      move: (key, direction) =>
        set((s) => {
          const arr = s.widgets.slice()
          const idx = arr.findIndex((w) => w.key === key)
          const dest = idx + direction
          if (idx < 0 || dest < 0 || dest >= arr.length) return s
          ;[arr[idx], arr[dest]] = [arr[dest], arr[idx]]
          return { widgets: arr }
        }),
      reset: () => set({ widgets: defaultWidgets }),
    }),
    {
      name: 'vw.dashboard',
      // If the schema changes we want users to get the new defaults, but
      // also preserve their existing reorder. Merge by key:
      merge: (persisted: unknown, current) => {
        if (!persisted || typeof persisted !== 'object') return current
        const p = persisted as Partial<DashboardState>
        if (!Array.isArray(p.widgets)) return current
        const knownKeys = new Set(defaultWidgets.map((w) => w.key))
        const seen = new Set<WidgetKey>()
        const ordered: Widget[] = []
        for (const w of p.widgets) {
          if (!w || !knownKeys.has(w.key as WidgetKey) || seen.has(w.key as WidgetKey)) continue
          seen.add(w.key as WidgetKey)
          const def = defaultWidgets.find((d) => d.key === w.key)!
          ordered.push({ ...def, visible: w.visible !== false })
        }
        // Append any new widgets not in saved state
        for (const w of defaultWidgets) if (!seen.has(w.key)) ordered.push(w)
        return { ...current, widgets: ordered }
      },
    },
  ),
)
