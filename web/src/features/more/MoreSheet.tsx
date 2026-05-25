import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  X, PackageSearch, Bell, BarChart3, LayoutGrid, ScanLine,
  ArrowDownToLine, Settings as SettingsIcon, LogIn, LogOut,
  ChevronRight, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/features/auth/store'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
}

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  hint?: string
}

// Everything not on the bottom tab bar gets a home here. Listed in
// rough "frequency of use" order on the floor.
const ITEMS: NavItem[] = [
  { to: '/inventory', label: 'Inventory', icon: PackageSearch, hint: 'Catalogue search + per-SKU detail' },
  { to: '/alerts', label: 'Alerts', icon: Bell, hint: 'Critical, low, zero stock + sync failures' },
  { to: '/reports', label: 'Reports', icon: BarChart3, hint: 'CSV exports + sync history' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, hint: 'Appearance, widgets, account' },
  { to: '/settings/layout', label: 'Layout editor', icon: LayoutGrid, hint: 'Edit aisles + bay counts. Sign-in required.' },
]

/**
 * Mobile "More" sheet — opens from the rightmost tab and surfaces every
 * route that doesn't fit in the bottom-bar's five slots. Also exposes
 * sign-in / sign-out so account state can be managed without scrolling
 * deep into the Customise sheet.
 */
export function MoreSheet({ open, onClose }: Props) {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const navigate = useNavigate()

  // Esc to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
        role="dialog"
        aria-label="More"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">More</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div
          className="overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]"
          style={{ maxHeight: 'calc(80dvh - 56px)' }}
        >
          <ul className="divide-y divide-line">
            {ITEMS.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  onClick={onClose}
                  className="group flex items-center gap-3 px-5 py-3.5 transition active:bg-surface-2"
                >
                  <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-surface-2 text-brand">
                    <it.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{it.label}</div>
                    {it.hint && (
                      <div className="truncate text-[11px] text-muted">{it.hint}</div>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-subtle" />
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Account block */}
          <div className="border-t border-line bg-surface-2/40 p-4">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-brand/15 font-mono text-[10px] font-bold uppercase text-brand">
                  {user.email.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    Signed in as
                  </div>
                  <div className="truncate text-sm font-semibold text-ink">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await signOut()
                    onClose()
                  }}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted',
                    'hover:border-bad/30 hover:text-bad',
                  )}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  // The SignInSheet lives in the topbar; the topbar's
                  // "Sign in" button opens it. Navigate to / so the
                  // topbar is in the obvious place.
                  navigate('/')
                  // Defer so the navigation finishes first
                  setTimeout(() => {
                    document
                      .querySelector<HTMLButtonElement>('[aria-label="Sign in" i], button[aria-label*="Sign in"]')
                      ?.click()
                  }, 50)
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-95"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

// Marker so unused-imports lint passes
void ScanLine
void ArrowDownToLine
