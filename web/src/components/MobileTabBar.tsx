import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutGrid, Boxes, ScanLine, ArrowDownToLine, MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/cn'
import { MoreSheet } from '@/features/more/MoreSheet'
import { useNavBadges } from '@/features/nav/badges'

interface Item {
  to: string
  label: string
  icon: LucideIcon
}

// Five most-used screens for warehouse floor staff. Everything else
// (Inventory, Alerts, Reports, Settings, Layout, sign-in/out) lives in
// the "More" sheet to keep the bar uncluttered on small phones.
const ITEMS: Item[] = [
  { to: '/', label: 'Home', icon: LayoutGrid },
  { to: '/warehouse', label: 'Warehouse', icon: Boxes },
  { to: '/replenish', label: 'Replenish', icon: ArrowDownToLine },
  { to: '/scan', label: 'Scan', icon: ScanLine },
]

export function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const badges = useNavBadges()
  return (
    <>
      <nav
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-lg"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-around gap-1">
          {ITEMS.map(({ to, label, icon: Icon }) => {
            const badge = to === '/replenish' ? badges.replen : 0
            return (
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
                    <span className="relative">
                      <Icon
                        className={cn(
                          'h-5 w-5 transition',
                          isActive && 'drop-shadow-[0_0_6px_rgb(var(--brand)/0.7)]',
                        )}
                      />
                      {badge > 0 && (
                        <span className="absolute -right-2 -top-1 grid h-3.5 min-w-[0.875rem] place-items-center rounded-full bg-warn px-1 text-[8px] font-bold leading-none text-white ring-2 ring-bg">
                          {badge > 99 ? '99' : badge}
                        </span>
                      )}
                    </span>
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-muted transition active:text-ink',
              moreOpen && 'text-brand',
            )}
            aria-label="More"
          >
            <span className="relative">
              <MoreHorizontal
                className={cn(
                  'h-5 w-5 transition',
                  moreOpen && 'drop-shadow-[0_0_6px_rgb(var(--brand)/0.7)]',
                )}
              />
              {badges.alerts > 0 && (
                <span className="absolute -right-2 -top-1 grid h-3.5 min-w-[0.875rem] place-items-center rounded-full bg-bad px-1 text-[8px] font-bold leading-none text-white ring-2 ring-bg">
                  {badges.alerts > 99 ? '99' : badges.alerts}
                </span>
              )}
            </span>
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
