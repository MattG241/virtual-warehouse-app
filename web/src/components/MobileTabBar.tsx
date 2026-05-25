import { NavLink } from 'react-router-dom'
import { LayoutGrid, Boxes, ScanLine, Bell, BarChart3, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Item {
  to: string
  label: string
  icon: LucideIcon
}

// Bottom tab bar on mobile (the lg:hidden sibling of Sidebar)
const ITEMS: Item[] = [
  { to: '/', label: 'Home', icon: LayoutGrid },
  { to: '/warehouse', label: 'Warehouse', icon: Boxes },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

export function MobileTabBar() {
  return (
    <nav
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-lg"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around gap-1">
        {ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition',
                isActive ? 'text-brand' : 'text-muted active:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    'h-5 w-5 transition',
                    isActive && 'drop-shadow-[0_0_6px_rgb(var(--brand)/0.7)]',
                  )}
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
