import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  Boxes,
  PackageSearch,
  BarChart3,
  Settings,
  ScanLine,
  Bell,
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
  { to: '/warehouse', label: 'Warehouse', icon: Boxes },
  { to: '/inventory', label: 'Inventory', icon: PackageSearch },
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
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-grad text-white shadow-glow">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" />
            <path d="M6 18V11" />
            <path d="M10 14v4" />
            <path d="M14 14v4" />
            <path d="M18 11v7" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold tracking-tight text-ink">Virtual Warehouse</h1>
          <p className="text-[11px] text-muted">Live stock control</p>
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
