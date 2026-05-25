import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { CommandCentreSwitch } from '@/routes/CommandCentreSwitch'
import { WarehouseSwitch } from '@/routes/WarehouseSwitch'
import { AisleView } from '@/routes/AisleView'
// Lazy: pulls ~300KB of three.js, only when the user opens the 3D view
const Heatmap = lazy(() => import('@/routes/Heatmap').then((m) => ({ default: m.Heatmap })))
import { Scan } from '@/routes/Scan'
import { Reports } from '@/routes/Reports'
import { InventorySwitch } from '@/routes/InventorySwitch'
import { Alerts } from '@/routes/Alerts'
import { Replenish } from '@/routes/Replenish'
import { Pick } from '@/routes/Pick'
import { Settings } from '@/routes/Settings'
import { LayoutEditor } from '@/routes/LayoutEditor'
import { About } from '@/routes/About'
import { NotFound } from '@/routes/NotFound'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ShortcutsHelp } from '@/features/shortcuts/ShortcutsHelp'
import { applyTheme, useTheme } from '@/store/theme'
import { useInventory } from '@/features/inventory/store'
import { useAuth } from '@/features/auth/store'
import { openEvents } from '@/lib/api'

function ThemeBridge() {
  const mode = useTheme((s) => s.mode)
  const accent = useTheme((s) => s.accent)
  useEffect(() => {
    applyTheme({ mode, accent })
  }, [mode, accent])
  return null
}

function InventoryBridge() {
  const refresh = useInventory((s) => s.refresh)
  useEffect(() => {
    refresh()
    const cleanup = openEvents({
      onSyncCompleted: () => refresh(),
      onLayoutUpdated: () => refresh(),
    })
    return cleanup
  }, [refresh])
  return null
}

function AuthBridge() {
  const refresh = useAuth((s) => s.refresh)
  useEffect(() => {
    refresh()
  }, [refresh])
  return null
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <ThemeBridge />
      <InventoryBridge />
      <AuthBridge />
      <ShortcutsHelp />
      <Routes>
        <Route
          path="/"
          element={
            <AppShell title="Command Centre">
              <CommandCentreSwitch />
            </AppShell>
          }
        />
        <Route
          path="/warehouse"
          element={
            <AppShell title="Warehouse">
              <WarehouseSwitch />
            </AppShell>
          }
        />
        <Route
          path="/warehouse/:aisleId"
          element={
            <AppShell title="Aisle walk-through">
              <AisleView />
            </AppShell>
          }
        />
        <Route
          path="/heatmap"
          element={
            <AppShell title="3D heatmap">
              <Suspense
                fallback={
                  <div className="grid h-[calc(100dvh-9rem)] place-items-center text-sm text-muted">
                    Loading 3D engine…
                  </div>
                }
              >
                <Heatmap />
              </Suspense>
            </AppShell>
          }
        />
        <Route
          path="/inventory"
          element={
            <AppShell title="Inventory">
              <InventorySwitch />
            </AppShell>
          }
        />
        <Route
          path="/alerts"
          element={
            <AppShell title="Alerts">
              <Alerts />
            </AppShell>
          }
        />
        <Route
          path="/replenish"
          element={
            <AppShell title="Replenishment">
              <Replenish />
            </AppShell>
          }
        />
        <Route
          path="/pick"
          element={
            <AppShell title="Pick route">
              <Pick />
            </AppShell>
          }
        />
        <Route
          path="/reports"
          element={
            <AppShell title="Reports">
              <Reports />
            </AppShell>
          }
        />
        <Route
          path="/scan"
          element={
            <AppShell title="Scan">
              <Scan />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell title="Settings">
              <Settings />
            </AppShell>
          }
        />
        <Route
          path="/settings/layout"
          element={
            <AppShell title="Layout editor">
              <LayoutEditor />
            </AppShell>
          }
        />
        <Route
          path="/about"
          element={
            <AppShell title="About">
              <About />
            </AppShell>
          }
        />
        <Route
          path="*"
          element={
            <AppShell title="Not found">
              <NotFound />
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  )
}
