import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  Boxes,
  PackageSearch,
  BarChart3,
  Settings,
  ScanLine,
  Bell,
  ArrowDownToLine,
  Route as RouteIcon,
  Box,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const NAV: NavItem[] = [
  { to: '/', label: 'Command Centre', icon: LayoutGrid },
  { to: '/heatmap', label: '3D heatmap', icon: Box },
  { to: '/warehouse', label: 'Warehouse', icon: Boxes },
  { to: '/inventory', label: 'Inventory', icon: PackageSearch },
  { to: '/pick', label: 'Pick route', icon: RouteIcon },
  { to: '/replenish', label: 'Replenish', icon: ArrowDownToLine },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/scan', label: 'Scan', icon: ScanLine },
]

export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex lg:w-64 lg:flex-col lg:gap-1 lg:border-r lg:border-line lg:bg-surface/40 lg:p-4 lg:backdrop-blur-md"
      aria-label="Primary navigation"
    >
      <div className="mb-5 flex items-center gap-3 px-2 pt-1">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-grad shadow-glow">
          <img
            src="/ryderwear-mark.png"
            alt=""
            aria-hidden
            className="h-7 w-7 object-contain"
            draggable={false}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold tracking-[0.18em] text-ink">RYDERWEAR</h1>
          <p className="text-[11px] text-muted">Virtual Warehouse</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive
                  ? 'bg-brand/15 text-ink ring-1 ring-inset ring-brand-ring/30 shadow-[0_0_0_1px_rgb(var(--brand)/0.25)_inset]'
                  : 'text-muted hover:bg-surface-2 hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-4 w-4 transition',
                    isActive ? 'text-brand' : 'text-muted group-hover:text-ink',
                  )}
                />
                {label}
                {isActive && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_rgb(var(--brand))]" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-surface-2 text-ink'
                : 'text-muted hover:bg-surface-2 hover:text-ink',
            )
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
      </div>
    </aside>
  )
}
