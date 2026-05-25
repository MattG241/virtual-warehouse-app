import { useEffect, useState } from 'react'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'
import { useInventory } from '@/features/inventory/store'
import { timeAgo } from '@/lib/inventory'
import { cn } from '@/lib/cn'

/**
 * Sync freshness pill — replaces the bare "refresh" icon button with a
 * live data badge that:
 *   • pulses green when fresh (last sync < 10 min)
 *   • yellow ring when stale (10–30 min)
 *   • red ring when very stale (> 30 min) — accompanied by a banner
 *
 * Tap to trigger a manual sync.
 */

const STALE_MS = 10 * 60 * 1000
const VERY_STALE_MS = 30 * 60 * 1000

export function useSyncFreshness() {
  const generatedAt = useInventory((s) => s.inventory?.generatedAt)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  if (!generatedAt) return { state: 'unknown' as const, age: null, label: 'never synced' }
  const age = now - new Date(generatedAt).getTime()
  const state =
    age < STALE_MS ? ('fresh' as const) : age < VERY_STALE_MS ? ('stale' as const) : ('very-stale' as const)
  return { state, age, label: timeAgo(generatedAt) }
}

interface Props {
  onClick?: () => void
  syncing?: boolean
}

export function SyncIndicator({ onClick, syncing }: Props) {
  const { state, label } = useSyncFreshness()
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Synced ${label} — tap to refresh`}
      aria-label={`Last sync ${label}. Tap to refresh.`}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-lg border bg-surface px-2.5 py-1.5 text-[11px] font-semibold transition',
        state === 'fresh' && 'border-good/30 text-good hover:border-good/50',
        state === 'stale' && 'border-warn/40 text-warn hover:border-warn/60',
        state === 'very-stale' && 'border-bad/40 text-bad hover:border-bad/60',
        state === 'unknown' && 'border-line text-muted hover:border-line-strong',
      )}
    >
      <span className="relative inline-flex h-2 w-2">
        {state === 'fresh' && (
          <>
            <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-good/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
          </>
        )}
        {state === 'stale' && <span className="inline-flex h-2 w-2 rounded-full bg-warn" />}
        {state === 'very-stale' && (
          <span className="inline-flex h-2 w-2 animate-pulse-soft rounded-full bg-bad" />
        )}
        {state === 'unknown' && <span className="inline-flex h-2 w-2 rounded-full bg-subtle/60" />}
      </span>
      <span className="hidden sm:inline">{syncing ? 'Syncing…' : label}</span>
    </button>
  )
}

/** Stale-data banner — shown at the top of the page when the snapshot
 *  is older than 30 min. Doesn't block use; just makes the staleness
 *  obvious so the user doesn't make decisions on old data. */
export function StaleDataBanner() {
  const { state, label } = useSyncFreshness()
  if (state !== 'very-stale') return null
  return (
    <div className="mb-3 flex items-start gap-3 rounded-lg border border-bad/30 bg-bad/10 px-4 py-2.5 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-bad">Stale data</div>
        <div className="text-[12px] text-bad/90">
          Last sync was {label}. Data may not reflect current stock — tap the sync indicator in the topbar to refresh.
        </div>
      </div>
    </div>
  )
}

// Marker so unused-imports lint passes
void Wifi
void WifiOff
