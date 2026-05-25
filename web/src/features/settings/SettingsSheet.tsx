import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  Check, Moon, Palette, Sun, X, GripVertical, Eye, EyeOff, RotateCcw,
  LayoutGrid, ChevronRight, LogIn, LogOut, User as UserIcon,
} from 'lucide-react'
import { useTheme, type Accent } from '@/store/theme'
import { useDashboard, defaultWidgets, type WidgetKey } from '@/features/dashboard/store'
import { useAuth } from '@/features/auth/store'
import { cn } from '@/lib/cn'

const ACCENTS: { key: Accent; label: string; swatch: string }[] = [
  { key: 'blue', label: 'Ryderwear blue', swatch: 'bg-[rgb(47,111,237)]' },
  { key: 'violet', label: 'Violet', swatch: 'bg-[rgb(139,92,246)]' },
  { key: 'emerald', label: 'Emerald', swatch: 'bg-[rgb(16,185,129)]' },
  { key: 'amber', label: 'Amber', swatch: 'bg-[rgb(245,158,11)]' },
  { key: 'rose', label: 'Rose', swatch: 'bg-[rgb(244,63,94)]' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsSheet({ open, onClose }: Props) {
  const mode = useTheme((s) => s.mode)
  const accent = useTheme((s) => s.accent)
  const setMode = useTheme((s) => s.setMode)
  const setAccent = useTheme((s) => s.setAccent)

  const widgets = useDashboard((s) => s.widgets)
  const toggle = useDashboard((s) => s.toggle)
  const move = useDashboard((s) => s.move)
  const reset = useDashboard((s) => s.reset)

  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  if (!open) return null

  // Portal to body so the sheet escapes any `backdrop-filter` / `transform`
  // ancestor that would otherwise become the containing block for our
  // position:fixed children (the Topbar uses `backdrop-blur-xl`).
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in"
        aria-hidden
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-labelledby="settings-heading"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <h2 id="settings-heading" className="text-base font-semibold text-ink">
            Customise
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-6 p-5">
          {/* Theme mode */}
          <section>
            <SectionTitle label="Appearance" />
            <div className="grid grid-cols-2 gap-2">
              <ModeCard
                active={mode === 'light'}
                onClick={() => setMode('light')}
                icon={<Sun className="h-4 w-4" />}
                label="Light"
              />
              <ModeCard
                active={mode === 'dark'}
                onClick={() => setMode('dark')}
                icon={<Moon className="h-4 w-4" />}
                label="Dark"
              />
            </div>
          </section>

          {/* Accent picker */}
          <section>
            <SectionTitle label="Accent" icon={<Palette className="h-3.5 w-3.5" />} />
            <div className="grid grid-cols-5 gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setAccent(a.key)}
                  aria-label={a.label}
                  title={a.label}
                  className={cn(
                    'relative grid aspect-square place-items-center rounded-xl border-2 transition',
                    a.key === accent
                      ? 'border-ink shadow-[0_4px_18px_-4px_rgb(var(--brand)/0.7)]'
                      : 'border-transparent hover:border-line-strong',
                  )}
                >
                  <span className={cn('h-7 w-7 rounded-full', a.swatch)} />
                  {a.key === accent && (
                    <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-bg">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* Dashboard widgets */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle label="Dashboard widgets" />
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-ink"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
            <ul className="divide-y divide-line/60 rounded-lg border border-line bg-surface-2/40">
              {widgets.map((w, i) => (
                <li
                  key={w.key}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5',
                    !w.visible && 'opacity-50',
                  )}
                >
                  <span className="cursor-grab text-subtle">
                    <GripVertical className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">
                      {labelFor(w.key)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => move(w.key, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(w.key, 1)}
                    disabled={i === widgets.length - 1}
                    aria-label="Move down"
                    className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle(w.key)}
                    aria-label={w.visible ? 'Hide' : 'Show'}
                    className={cn(
                      'grid h-7 w-7 place-items-center rounded-md transition',
                      w.visible
                        ? 'text-muted hover:bg-surface-3 hover:text-ink'
                        : 'bg-brand/15 text-brand hover:bg-brand/25',
                    )}
                  >
                    {w.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Drag-ordered with the arrow buttons. Eye toggle hides a card from the
              Command Centre. Saved per-device.
            </p>
          </section>

          {/* Workspace links — mobile users have no sidebar, so these
              destinations need to live somewhere reachable from the gear. */}
          <section>
            <SectionTitle label="Workspace" />
            <Link
              to="/settings/layout"
              onClick={onClose}
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-3 transition hover:border-brand-ring/40 hover:bg-surface-2"
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-good/15 text-good">
                <LayoutGrid className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">Warehouse layout</div>
                <div className="text-[11px] text-muted">
                  Add or remove aisles and adjust bay counts. Sign-in required.
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
            </Link>
          </section>

          {/* Account — sign-in / sign-out lives here too so mobile users
              can manage their session without a separate page. */}
          <section>
            <SectionTitle label="Account" />
            {user ? (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-brand/15 font-mono text-[10px] font-bold uppercase text-brand">
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
                  }}
                  aria-label="Sign out"
                  className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-bad/15 hover:text-bad"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-3 text-sm text-muted">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-subtle/15 text-subtle">
                  <UserIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  Not signed in. Use the <strong className="text-ink">Sign in</strong> button
                  in the topbar.
                </span>
                <LogIn className="h-4 w-4 flex-shrink-0 text-subtle" />
              </div>
            )}
          </section>
        </div>
      </aside>
    </>,
    document.body,
  )
}

function SectionTitle({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
      {icon}
      {label}
    </div>
  )
}

function ModeCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition',
        active
          ? 'border-brand-ring bg-brand/15 text-brand'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

function labelFor(key: WidgetKey): string {
  return defaultWidgets.find((w) => w.key === key)?.label || key
}
