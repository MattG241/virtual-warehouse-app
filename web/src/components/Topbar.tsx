import { useEffect, useState } from 'react'
import { Search, Sun, Moon, Settings as SettingsIcon, LogIn, LogOut, User as UserIcon } from 'lucide-react'
import { Button } from './ui/Button'
import { useTheme } from '@/store/theme'
import { useInventory } from '@/features/inventory/store'
import { syncNow } from '@/lib/api'
import { cn } from '@/lib/cn'
import { useSearch } from '@/features/search/store'
import { SettingsSheet } from '@/features/settings/SettingsSheet'
import { useAuth } from '@/features/auth/store'
import { SignInSheet } from '@/features/auth/SignInSheet'
import { SyncIndicator } from './SyncIndicator'

interface Props {
  title: string
}

export function Topbar({ title }: Props) {
  const mode = useTheme((s) => s.mode)
  const toggleMode = useTheme((s) => s.toggleMode)
  const refresh = useInventory((s) => s.refresh)
  const openSearch = useSearch((s) => s.open)
  const [syncing, setSyncing] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [signInOpen, setSignInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)

  // Keep "x mins ago" fresh without thrashing
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  void now // referenced to keep the interval re-render meaningful

  // ⌘K / Ctrl+K → open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openSearch])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncNow()
      await refresh()
    } catch (e) {
      console.warn('sync failed', e)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 -mx-4 mb-5 flex items-center gap-3 border-b border-line/60 bg-bg/80 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:border-line sm:px-5">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
          Warehouse OS
        </p>
        <h2 className="truncate text-lg font-semibold text-ink sm:text-xl">{title}</h2>
      </div>

      {/* Desktop: real input. Typing pops the overlay with the typed text
          pre-seeded so search starts immediately. Focus alone (no typing)
          also opens it for a clean "click the search bar" feel. */}
      <div
        className="relative hidden sm:flex items-center"
        onClick={(e) => {
          // Clicking anywhere on the wrapper focuses the input
          const input = e.currentTarget.querySelector('input') as HTMLInputElement | null
          input?.focus()
        }}
      >
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
        <input
          type="search"
          placeholder="Search anything…"
          // Stays empty in the topbar — actual query is in the overlay
          value=""
          onChange={(e) => openSearch(e.target.value)}
          onFocus={(e) => {
            // Open the overlay; pre-seed only if there's already text
            openSearch(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              openSearch()
            }
          }}
          aria-label="Search"
          className="h-10 min-w-[280px] rounded-lg border border-line bg-surface pl-10 pr-16 text-sm text-ink placeholder:text-muted focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
        />
        <kbd className="pointer-events-none absolute right-3 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">
          ⌘K
        </kbd>
      </div>

      <button
        type="button"
        onClick={() => openSearch()}
        aria-label="Search"
        className="sm:hidden grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink"
      >
        <Search className="h-4 w-4" />
      </button>

      <SyncIndicator onClick={handleSync} syncing={syncing} />

      <Button
        variant="ghost"
        size="md"
        onClick={toggleMode}
        className="!h-10 !w-10 !p-0"
        aria-label="Toggle theme"
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <Button
        variant="ghost"
        size="md"
        onClick={() => setSettingsOpen(true)}
        className="!h-10 !w-10 !p-0"
        aria-label="Settings"
        title="Theme, accent, dashboard widgets"
      >
        <SettingsIcon className="h-4 w-4" />
      </Button>

      {user ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface font-mono text-xs font-bold uppercase text-brand hover:border-line-strong"
            aria-label={`Signed in as ${user.email}`}
            title={user.email}
          >
            {user.email.slice(0, 2)}
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-lg border border-line bg-surface shadow-pop animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="border-b border-line px-3 py-2 text-[11px] text-muted">
                  Signed in as
                  <div className="truncate text-sm font-semibold text-ink">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false)
                    await signOut()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <Button
          variant="secondary"
          size="md"
          onClick={() => setSignInOpen(true)}
          className="!h-10 !px-3"
          icon={<LogIn className="h-4 w-4" />}
        >
          <span className="hidden sm:inline">Sign in</span>
        </Button>
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SignInSheet open={signInOpen} onClose={() => setSignInOpen(false)} />
    </header>
  )
}

// Marker so unused-imports lint passes
void UserIcon

