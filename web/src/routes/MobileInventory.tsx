// Mobile Inventory — iOS-style search field at top, segmented filter,
// dividers-only list. Detail opens in a slide-up sheet (the existing
// SkuSheet handles that). No bordered cards.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, Check, AlertTriangle, CircleSlash2 } from 'lucide-react'
import { ListGroup, ListRow } from '@/components/ui/ListGroup'
import { StatusPill } from '@/components/ui/StatusPill'
import { useInventory } from '@/features/inventory/store'
import { perSku, fmtN, type SkuSummary } from '@/lib/inventory'
import { cn } from '@/lib/cn'
import type { Status } from '@/lib/types'

type FilterKey = 'all' | 'healthy' | 'low' | 'critical' | 'empty'

const FILTERS: { key: FilterKey; label: string; tone: 'subtle' | 'good' | 'warn' | 'bad' | 'info' }[] = [
  { key: 'all', label: 'All', tone: 'subtle' },
  { key: 'healthy', label: 'Stocked', tone: 'good' },
  { key: 'critical', label: 'Critical', tone: 'bad' },
  { key: 'low', label: 'Low', tone: 'warn' },
  { key: 'empty', label: 'Empty', tone: 'info' },
]

export function MobileInventory() {
  const inv = useInventory((s) => s.inventory)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') || '')
  const [filter, setFilter] = useState<FilterKey>(() => {
    const s = params.get('status') as FilterKey | null
    return s && ['all', 'healthy', 'low', 'critical', 'empty'].includes(s) ? s : 'all'
  })
  const [selected, setSelected] = useState<SkuSummary | null>(null)
  const deferredQ = useDeferredValue(query.trim().toLowerCase())

  const skus = useMemo(() => (inv ? perSku(inv) : []), [inv])
  const counts = useMemo(() => {
    const c = { healthy: 0, low: 0, critical: 0, empty: 0 }
    for (const s of skus) c[s.status]++
    return c
  }, [skus])

  const visible = useMemo(() => {
    const mFilter = (s: SkuSummary) => (filter === 'all' ? true : s.status === filter)
    const mQuery = (s: SkuSummary) => {
      if (!deferredQ) return true
      return (
        s.sku.toLowerCase().includes(deferredQ) ||
        s.name.toLowerCase().includes(deferredQ)
      )
    }
    return skus.filter((s) => mFilter(s) && mQuery(s)).slice(0, 200)
  }, [skus, filter, deferredQ])

  // Sync URL
  const lastSig = useRef('')
  useEffect(() => {
    const sig = `${query.trim()}|${filter}`
    if (sig === lastSig.current) return
    lastSig.current = sig
    const next = new URLSearchParams(params)
    if (query.trim()) next.set('q', query.trim())
    else next.delete('q')
    if (filter !== 'all') next.set('status', filter)
    else next.delete('status')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter])

  // Auto-open SKU sheet on exact match
  const autoOpenedRef = useRef(false)
  useEffect(() => {
    if (autoOpenedRef.current || !inv) return
    const q = (params.get('q') || '').trim()
    if (!q) return
    const exact = perSku(inv).find((s) => s.sku.toLowerCase() === q.toLowerCase())
    if (exact) {
      setSelected(exact)
      autoOpenedRef.current = true
    }
  }, [inv, params])

  if (!inv) return null

  return (
    <div className="space-y-3 pb-4">
      {/* Search field — iOS-style flat */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search SKU or product name"
          className="h-11 w-full rounded-xl bg-surface/80 pl-10 pr-10 text-[15px] text-ink placeholder:text-subtle focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear"
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Segmented filter — iOS-style */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = f.key === filter
          const n = f.key === 'all' ? skus.length : counts[f.key as Status]
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition',
                active
                  ? f.tone === 'good'
                    ? 'bg-good/15 text-good'
                    : f.tone === 'warn'
                      ? 'bg-warn/15 text-warn'
                      : f.tone === 'bad'
                        ? 'bg-bad/15 text-bad'
                        : f.tone === 'info'
                          ? 'bg-info/15 text-info'
                          : 'bg-brand/15 text-brand'
                  : 'bg-surface/60 text-muted active:bg-surface-2',
              )}
            >
              <span>{f.label}</span>
              <span className="tnum rounded-full bg-black/20 px-1.5 py-px text-[10px] font-bold">
                {fmtN(n)}
              </span>
            </button>
          )
        })}
      </div>

      {/* Catalogue list */}
      <ListGroup
        title={
          deferredQ || filter !== 'all'
            ? `${fmtN(visible.length)} match${visible.length === 1 ? '' : 'es'}`
            : 'All SKUs'
        }
        footnote={visible.length === 200 ? 'Showing first 200 — refine the search.' : undefined}
      >
        {visible.length === 0 ? (
          <ListRow title="No matches" subtitle="Try a different filter or clear the search" />
        ) : (
          visible.map((s) => (
            <ListRow
              key={s.sku}
              leading={
                <span
                  className={cn(
                    'grid h-10 w-10 place-items-center rounded-lg',
                    s.status === 'healthy' && 'bg-good/15 text-good',
                    s.status === 'low' && 'bg-warn/15 text-warn',
                    s.status === 'critical' && 'bg-bad/15 text-bad',
                    s.status === 'empty' && 'bg-info/15 text-info',
                  )}
                >
                  {s.status === 'empty' ? (
                    <CircleSlash2 className="h-4 w-4" />
                  ) : s.status === 'critical' || s.status === 'low' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </span>
              }
              title={<span className="font-mono">{s.sku}</span>}
              subtitle={s.name || '—'}
              trailing={
                <span className="flex flex-col items-end">
                  <span className="tnum text-base font-bold text-ink">{fmtN(s.totalUnits)}</span>
                  <span className="text-[10px] text-muted">{s.locations} loc</span>
                </span>
              }
              onClick={() => setSelected(s)}
            />
          ))
        )}
      </ListGroup>

      {selected && <MobileSkuSheet sku={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

function MobileSkuSheet({ sku, onClose }: { sku: SkuSummary; onClose: () => void }) {
  const inv = useInventory((s) => s.inventory)
  const locations = useMemo(() => {
    if (!inv) return [] as { code: string; qty: number }[]
    const out: { code: string; qty: number }[] = []
    for (const [code, entries] of Object.entries(inv.grid)) {
      for (const [s, q] of entries) {
        if (s === sku.sku && q > 0) out.push({ code, qty: Number(q) })
      }
    }
    for (const [loc, s, q] of inv.other) {
      if (s === sku.sku && q > 0) out.push({ code: String(loc), qty: Number(q) })
    }
    return out.sort((a, b) => b.qty - a.qty)
  }, [inv, sku.sku])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="mx-auto mb-2 mt-2 h-1 w-10 rounded-full bg-line" />
        <header className="flex items-start justify-between gap-3 px-5 pb-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted">SKU</div>
            <h3 className="truncate font-mono text-base font-bold text-ink">{sku.sku}</h3>
            <p className="mt-0.5 text-[12px] text-muted">{sku.name || '—'}</p>
          </div>
          <StatusPill status={sku.status} />
        </header>
        <div className="max-h-[60dvh] overflow-y-auto pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <div className="grid grid-cols-2 gap-2 px-5 pb-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Units</div>
              <div className="tnum mt-0.5 text-2xl font-bold text-ink">{fmtN(sku.totalUnits)}</div>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted">Locations</div>
              <div className="tnum mt-0.5 text-2xl font-bold text-ink">{fmtN(sku.locations)}</div>
            </div>
          </div>
          <ListGroup title="Locations">
            {locations.length === 0 ? (
              <ListRow title="No active locations" subtitle="SKU is currently zero-stock." />
            ) : (
              locations.slice(0, 50).map((l) => (
                <ListRow
                  key={l.code}
                  title={<span className="font-mono">{l.code}</span>}
                  trailing={
                    <span className="tnum text-base font-bold text-ink">{fmtN(l.qty)}</span>
                  }
                />
              ))
            )}
          </ListGroup>
        </div>
      </div>
    </div>
  )
}
