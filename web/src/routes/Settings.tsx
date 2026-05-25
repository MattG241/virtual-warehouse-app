import { Link } from 'react-router-dom'
import {
  Palette,
  LayoutGrid,
  ChevronRight,
  User as UserIcon,
  LogIn,
  LogOut,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useAuth } from '@/features/auth/store'
import { useState } from 'react'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { SignInSheet } from '@/features/auth/SignInSheet'

/**
 * /settings — a hub linking out to each customisation surface. The
 * theme/accent/widgets panel lives in a slide-in sheet (also accessible
 * from the topbar gear) so this page is just the index.
 */
export function Settings() {
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const [sheet, setSheet] = useState(false)
  const [signIn, setSignIn] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader eyebrow="Customise" title="Settings" />
        <CardBody className="!p-0">
          <ul className="divide-y divide-line">
            <li>
              <button
                type="button"
                onClick={() => setSheet(true)}
                className="group flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-surface-2"
              >
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                  <Palette className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">
                    Appearance &amp; widgets
                  </div>
                  <div className="text-[11px] text-muted">
                    Theme mode, accent colour, dashboard widget order &amp; visibility.
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
              </button>
            </li>
            <li>
              <Link
                to="/settings/layout"
                className="group flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-surface-2"
              >
                <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-good/15 text-good">
                  <LayoutGrid className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">Warehouse layout</div>
                  <div className="text-[11px] text-muted">
                    Add or remove aisles and adjust bay counts. Requires sign-in.
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
              </Link>
            </li>
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Account" title="Sign-in" />
        <CardBody>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-brand/15 font-mono text-xs font-bold uppercase text-brand">
                {user.email.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Signed in as
                </div>
                <div className="truncate text-sm font-semibold text-ink">{user.email}</div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted hover:border-bad/30 hover:text-bad"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-subtle/15 text-subtle">
                <UserIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">Not signed in</div>
                <div className="text-[11px] text-muted">
                  Sign in to edit the warehouse layout and view audit history.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSignIn(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-glow hover:opacity-95"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      <SettingsSheet open={sheet} onClose={() => setSheet(false)} />
      <SignInSheet open={signIn} onClose={() => setSignIn(false)} />
    </div>
  )
}
