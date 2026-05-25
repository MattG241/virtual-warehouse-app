import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { CommandCentre } from '@/routes/CommandCentre'
import { Placeholder } from '@/routes/Placeholder'
import { applyTheme, useTheme } from '@/store/theme'
import { useInventory } from '@/features/inventory/store'
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

export default function App() {
  return (
    <BrowserRouter>
      <ThemeBridge />
      <InventoryBridge />
      <Routes>
        <Route
          path="/"
          element={
            <AppShell title="Command Centre">
              <CommandCentre />
            </AppShell>
          }
        />
        <Route
          path="/warehouse"
          element={
            <AppShell title="Warehouse">
              <Placeholder title="3D Warehouse Heatmap" />
            </AppShell>
          }
        />
        <Route
          path="/inventory"
          element={
            <AppShell title="Inventory">
              <Placeholder title="Inventory" />
            </AppShell>
          }
        />
        <Route
          path="/alerts"
          element={
            <AppShell title="Alerts">
              <Placeholder title="Active alerts" />
            </AppShell>
          }
        />
        <Route
          path="/reports"
          element={
            <AppShell title="Reports">
              <Placeholder title="Reports & exports" />
            </AppShell>
          }
        />
        <Route
          path="/scan"
          element={
            <AppShell title="Scan">
              <Placeholder title="Barcode scanner" />
            </AppShell>
          }
        />
        <Route
          path="/settings"
          element={
            <AppShell title="Settings">
              <Placeholder title="Settings" body="Theme accent, dashboard widgets, and account." />
            </AppShell>
          }
        />
        <Route
          path="*"
          element={
            <AppShell title="Not found">
              <Placeholder title="Not found" body="That page doesn't exist." />
            </AppShell>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
