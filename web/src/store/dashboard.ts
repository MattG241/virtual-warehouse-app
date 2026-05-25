import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Widgets the user can show/hide and reorder on the dashboard.
export type WidgetId =
  | 'kpi-units'
  | 'kpi-fullness'
  | 'kpi-empty'
  | 'kpi-skus'
  | 'low-stock'
  | 'aisle-heatmap'
  | 'recent-syncs'
  | 'alerts'

export interface WidgetState {
  id: WidgetId
  visible: boolean
}

const DEFAULT_ORDER: WidgetState[] = [
  { id: 'kpi-units', visible: true },
  { id: 'kpi-fullness', visible: true },
  { id: 'kpi-empty', visible: true },
  { id: 'kpi-skus', visible: true },
  { id: 'low-stock', visible: true },
  { id: 'aisle-heatmap', visible: true },
  { id: 'alerts', visible: true },
  { id: 'recent-syncs', visible: true },
]

interface DashboardState {
  widgets: WidgetState[]
  setWidgets: (w: WidgetState[]) => void
  toggle: (id: WidgetId) => void
  move: (id: WidgetId, dir: -1 | 1) => void
  reset: () => void
}

export const useDashboard = create<DashboardState>()(
  persist(
    (set, get) => ({
      widgets: DEFAULT_ORDER,
      setWidgets: (widgets) => set({ widgets }),
      toggle: (id) =>
        set({
          widgets: get().widgets.map((w) =>
            w.id === id ? { ...w, visible: !w.visible } : w,
          ),
        }),
      move: (id, dir) => {
        const ws = [...get().widgets]
        const i = ws.findIndex((w) => w.id === id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= ws.length) return
        ;[ws[i], ws[j]] = [ws[j], ws[i]]
        set({ widgets: ws })
      },
      reset: () => set({ widgets: DEFAULT_ORDER }),
    }),
    {
      name: 'vw.dashboard',
      // Merge defaults so new widgets appear automatically for existing users
      merge: (persisted: unknown, current) => {
        const p = persisted as Partial<DashboardState> | undefined
        const persistedWidgets = p?.widgets ?? []
        const known = new Set(persistedWidgets.map((w) => w.id))
        const merged = [
          ...persistedWidgets.filter((w) => DEFAULT_ORDER.some((d) => d.id === w.id)),
          ...DEFAULT_ORDER.filter((d) => !known.has(d.id)),
        ]
        return { ...current, ...p, widgets: merged }
      },
    },
  ),
)
