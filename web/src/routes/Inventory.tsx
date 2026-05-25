import { useDeferredValue, useMemo, useState } from 'react'
import { Search, MapPin, AlertTriangle, CircleSlash2, Check, X } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { useInventory } from '@/features/inventory/store'
import { perSku, fmtN, type SkuSummary } from '@/lib/inventory'
import { cn } from '@/lib/cn'
import type { Status } from '@/lib/types'

type FilterKey = 'all' | 'healthy' | 'low' | 'critical' | 'empty'

const FILTERS: { key: FilterKey; label: string; tone: 'subtle' | 'good' | 'warn' | 'bad' | 'info' }[] = [
  { key: 'all', label: 'All', tone: 'subtle' },
  { key: 'healthy', label: 'Stocked', tone: 'good' },
  { key: 'low', label: 'Low', tone: 'warn' },
  { key: 'critical', label: 'Critical', tone: 'bad' },
  { key: 'empty', label: 'Empty', tone: 'info' },
]

export function Inventory() {
  const inv = useInventory((s) => s.inventory)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selected, setSelected] = useState<SkuSummary | null>(null)
  const deferredQ = useDeferredValue(query.trim().toLowerCase())

  const skus = useMemo(() => (inv ? perSku(inv) : []), [inv])

  const counts = useMemo(() => {
    const c = { healthy: 0, low: 0, critical: 0, empty: 0 }
    for (const s of skus) c[s.status]++
    return c
  }, [skus])

  const visible = useMemo(() => {
    const matchesFilter = (s: SkuSummary) =>
      filter === 'all' ? true : s.status === filter
    const matchesQuery = (s: SkuSummary) => {
      if (!deferredQ) return true
      return (
        s.sku.toLowerCase().includes(deferredQ) ||
        s.name.toLowerCase().includes(deferredQ)
      )
    }
    return skus.filter((s) => matchesFilter(s) && matchesQuery(s)).slice(0, 200)
  }, [skus, filter, deferredQ])

  if (!inv) return null

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Catalogue"
          title="Inventory"
          action={
            <span className="hidden text-[11px] text-muted sm:inline">
              {fmtN(skus.length)} SKUs · showing {visible.length}
            </span>
          }
        />
        <CardBody className="space-y-3 !pt-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SKU or product name"
              className="h-11 w-full rounded-lg border border-line bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
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

          {/* Filter chips */}
          <div className="-mx-1 flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = f.key === filter
              const n = f.key === 'all' ? skus.length : counts[f.key as Status]
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                    active
                      ? f.tone === 'good'
                        ? 'border-good/40 bg-good/15 text-good'
                        : f.tone === 'warn'
                          ? 'border-warn/40 bg-warn/15 text-warn'
                          : f.tone === 'bad'
                            ? 'border-bad/40 bg-bad/15 text-bad'
                            : f.tone === 'info'
                              ? 'border-info/40 bg-info/15 text-info'
                              : 'border-brand-ring/40 bg-brand/15 text-brand'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
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
        </CardBody>
      </Card>

      <Card>
        <CardBody className="!p-0">
          {visible.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted">
              No SKUs match your filters.
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {visible.map((s) => (
                <li key={s.sku}>
                  <button
                    type="button"
                    onClick={() => setSelected(s)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2 sm:px-5"
                  >
                    <span
                      className={cn(
                        'grid h-10 w-10 flex-shrink-0 place-items-center rounded-md text-xs font-bold',
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
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm font-semibold text-ink">
                        {s.sku}
                      </div>
                      <div className="truncate text-xs text-muted">
                        {s.name || '—'}
                        {s.color && <span className="ml-2">{s.color}</span>}
                        {s.size && <span className="ml-2">{s.size}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-sm font-bold text-ink">{fmtN(s.totalUnits)}</div>
                      <div className="flex items-center justify-end gap-1 text-[11px] text-muted">
                        <MapPin className="h-3 w-3" />
                        {s.locations}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {visible.length === 200 && (
            <div className="border-t border-line bg-surface-2/40 px-5 py-2 text-center text-[11px] text-muted">
              Showing first 200. Refine your search to see more.
            </div>
          )}
        </CardBody>
      </Card>

      {selected && <SkuSheet sku={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

interface SkuSheetProps {
  sku: SkuSummary
  onClose: () => void
}

function SkuSheet({ sku, onClose }: SkuSheetProps) {
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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line bg-surface-2/40 px-5 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
              SKU detail
            </div>
            <h3 className="truncate font-mono text-base font-bold text-ink">
              {sku.sku}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[70dvh] overflow-y-auto">
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">
                  {sku.name || '—'}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
                  {sku.color && (
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5">{sku.color}</span>
                  )}
                  {sku.size && (
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5">{sku.size}</span>
                  )}
                </div>
              </div>
              <StatusPill status={sku.status} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Total units
                </div>
                <div className="tnum mt-0.5 text-2xl font-bold text-ink">
                  {fmtN(sku.totalUnits)}
                </div>
              </div>
              <div className="rounded-lg bg-surface-2 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Locations
                </div>
                <div className="tnum mt-0.5 text-2xl font-bold text-ink">
                  {fmtN(sku.locations)}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                Locations
              </div>
              {locations.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-surface-2/40 p-4 text-center text-sm text-muted">
                  No active locations.
                </p>
              ) : (
                <ul className="divide-y divide-line/60 rounded-lg border border-line bg-surface-2/40">
                  {locations.slice(0, 50).map((l) => (
                    <li key={l.code} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono text-xs text-ink">{l.code}</span>
                      <span className="tnum text-sm font-semibold text-ink">
                        {fmtN(l.qty)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {locations.length > 50 && (
                <p className="mt-2 text-center text-[11px] text-muted">
                  Showing 50 of {locations.length} locations.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
