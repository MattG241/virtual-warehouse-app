import { useEffect, useState } from 'react'
import { Search, Bell, Sun, Moon, RefreshCw } from 'lucide-react'
import { Button } from './ui/Button'
import { useTheme } from '@/store/theme'
import { useInventory } from '@/features/inventory/store'
import { syncNow } from '@/lib/api'
import { timeAgo } from '@/lib/inventory'
import { cn } from '@/lib/cn'
import { useSearch } from '@/features/search/store'

interface Props {
  title: string
}

export function Topbar({ title }: Props) {
  const mode = useTheme((s) => s.mode)
  const toggleMode = useTheme((s) => s.toggleMode)
  const generatedAt = useInventory((s) => s.inventory?.generatedAt)
  const refresh = useInventory((s) => s.refresh)
  const openSearch = useSearch((s) => s.open)
  const [syncing, setSyncing] = useState(false)
  const [now, setNow] = useState(Date.now())

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

      <button
        type="button"
        onClick={openSearch}
        className="hidden sm:flex group h-10 min-w-[280px] items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-muted transition hover:border-line-strong hover:text-ink"
      >
        <Search className="h-4 w-4" />
        <span>Search anything…</span>
        <kbd className="ml-auto rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-subtle">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        className="sm:hidden grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink"
      >
        <Search className="h-4 w-4" />
      </button>

      <Button
        variant="secondary"
        size="md"
        onClick={handleSync}
        disabled={syncing}
        className="!h-10 !w-10 !p-0"
        title={generatedAt ? `Last sync ${timeAgo(generatedAt)}` : 'Sync now'}
        aria-label="Sync inventory now"
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
      </Button>

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
        className="!h-10 !w-10 !p-0 hidden sm:inline-flex"
        aria-label="Alerts"
      >
        <Bell className="h-4 w-4" />
      </Button>
    </header>
  )
}
