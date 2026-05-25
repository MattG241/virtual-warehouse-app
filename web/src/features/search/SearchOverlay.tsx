import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, X, Package, MapPin, ArrowRight } from 'lucide-react'
import { useSearch } from './store'
import { useInventory } from '@/features/inventory/store'
import { cn } from '@/lib/cn'
import { allSlots, fmtN } from '@/lib/inventory'
import type { Inventory } from '@/lib/types'

type Tab = 'all' | 'products' | 'locations'

interface SkuHit {
  kind: 'sku'
  sku: string
  name: string
  totalUnits: number
  locations: number
}
interface LocHit {
  kind: 'location'
  code: string
  units: number
}
type Hit = SkuHit | LocHit

const MAX_SKU = 12
const MAX_LOC = 8

function rank(inv: Inventory | null, q: string, tab: Tab): { skus: SkuHit[]; locs: LocHit[] } {
  if (!inv || !q.trim()) return { skus: [], locs: [] }
  const qLow = q.trim().toLowerCase()

  const skuLocations = new Map<string, { code: string; qty: number }[]>()
  for (const [code, entries] of Object.entries(inv.grid)) {
    for (const [sku, qty] of entries) {
      if (!skuLocations.has(sku)) skuLocations.set(sku, [])
      skuLocations.get(sku)!.push({ code, qty })
    }
  }
  for (const [loc, sku, qty] of inv.other) {
    if (!skuLocations.has(sku)) skuLocations.set(sku, [])
    skuLocations.get(sku)!.push({ code: loc, qty })
  }

  const skus: SkuHit[] = []
  if (tab !== 'locations') {
    for (const [sku, meta] of Object.entries(inv.skus)) {
      const name = meta?.[0] || ''
      const sLow = sku.toLowerCase()
      const nLow = name.toLowerCase()
      let score = 0
      if (sLow === qLow) score = 1000
      else if (sLow.startsWith(qLow)) score = 700
      else if (nLow.startsWith(qLow)) score = 500
      else if (sLow.includes(qLow)) score = 300
      else if (nLow.includes(qLow)) score = 200
      if (score > 0) {
        const locs = skuLocations.get(sku) || []
        const totalUnits = locs.reduce((s, l) => s + (Number(l.qty) || 0), 0)
        skus.push({ kind: 'sku', sku, name, totalUnits, locations: locs.length })
      }
    }
    skus.sort((a, b) => b.totalUnits - a.totalUnits)
    skus.length = Math.min(skus.length, MAX_SKU)
  }

  const locs: LocHit[] = []
  if (tab !== 'products') {
    // Search against *every* physical slot, not just stocked ones, so a
    // partial code like "A01.B01" finds the bay even when it's empty —
    // that's the put-away workflow (find an empty slot by location).
    const slots = allSlots(inv)
    for (const slot of slots) {
      if (slot.code.toLowerCase().includes(qLow)) {
        locs.push({ kind: 'location', code: slot.code, units: slot.totalUnits })
        if (locs.length >= MAX_LOC) break
      }
    }
  }

  return { skus, locs }
}

export function SearchOverlay() {
  const isOpen = useSearch((s) => s.isOpen)
  const initialQuery = useSearch((s) => s.initialQuery)
  const close = useSearch((s) => s.close)
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setQ(initialQuery)
      setActiveIdx(0)
      setTab('all')
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (!el) return
        el.focus()
        // Put the caret at the end so typing continues naturally
        const len = el.value.length
        el.setSelectionRange(len, len)
      })
    }
  }, [isOpen, initialQuery])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [isOpen, close])

  const { skus, locs } = useMemo(() => rank(inv, q, tab), [inv, q, tab])
  const flat: Hit[] = [...skus, ...locs]

  function pick(hit: Hit) {
    if (hit.kind === 'sku') {
      navigate(`/inventory?q=${encodeURIComponent(hit.sku)}`)
    } else {
      // Parse the location code "A01.B05.L02.S3" and drill straight into
      // the aisle walk-through with the slot pre-selected.
      const aisleMatch = /^(A\d+)/.exec(hit.code)
      const aisleId = aisleMatch?.[1]
      if (aisleId) {
        navigate(`/warehouse/${aisleId}?slot=${encodeURIComponent(hit.code)}`)
      } else {
        // Non-standard location code (e.g. an "other" overflow location).
        // Drop them on the warehouse list rather than the dead ?loc= URL.
        navigate('/warehouse')
      }
    }
    close()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flat[activeIdx]) pick(flat[activeIdx])
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-md sm:p-4 sm:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="glass relative flex w-full max-w-2xl flex-col overflow-hidden border-line-strong/40 sm:rounded-2xl shadow-pop max-h-[100dvh] sm:max-h-[80vh] h-full sm:h-auto">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <SearchIcon className="h-5 w-5 text-muted" />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActiveIdx(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Aisle, shelf, box ID, SKU, or product name"
            className="flex-1 bg-transparent text-base font-medium text-ink placeholder:text-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-line px-3 py-2">
          {(
            [
              { id: 'all', label: 'All', count: skus.length + locs.length },
              { id: 'products', label: 'Products', count: skus.length },
              { id: 'locations', label: 'Locations', count: locs.length },
            ] as { id: Tab; label: string; count: number }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition',
                tab === t.id
                  ? 'bg-brand/15 text-brand ring-1 ring-inset ring-brand-ring/30'
                  : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {t.label}
              {q && (
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {!q.trim() ? (
            <EmptyHint />
          ) : flat.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">
              No matches for <strong className="text-ink">"{q}"</strong>
            </div>
          ) : (
            <ul className="p-2">
              {skus.length > 0 && (
                <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  Products ({skus.length})
                </li>
              )}
              {skus.map((s, i) => {
                const idx = i
                return (
                  <li key={`s-${s.sku}`}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition',
                        activeIdx === idx
                          ? 'bg-brand/15 ring-1 ring-inset ring-brand-ring/30'
                          : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-surface-2 text-brand">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-ink">{s.sku}</div>
                        <div className="truncate text-xs text-muted">
                          {s.name || '—'} · {fmtN(s.totalUnits)} units · {s.locations}{' '}
                          {s.locations === 1 ? 'location' : 'locations'}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-subtle" />
                    </button>
                  </li>
                )
              })}
              {locs.length > 0 && (
                <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-subtle">
                  Locations ({locs.length})
                </li>
              )}
              {locs.map((l, i) => {
                const idx = skus.length + i
                return (
                  <li key={`l-${l.code}`}>
                    <button
                      type="button"
                      onClick={() => pick(l)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition',
                        activeIdx === idx
                          ? 'bg-brand/15 ring-1 ring-inset ring-brand-ring/30'
                          : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-surface-2 text-brand">
                        <MapPin className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm font-semibold text-ink">
                          {l.code}
                        </div>
                        <div className="text-xs text-muted">{fmtN(l.units)} units</div>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-subtle" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface/50 px-4 py-2 text-[11px] text-subtle">
          <div className="flex items-center gap-3">
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">↑↓</kbd>
            navigate
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">↵</kbd>
            open
          </div>
          <div className="flex items-center gap-2">
            <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono">
              esc
            </kbd>
            close
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div className="p-6 text-sm text-muted">
      <p className="mb-3">Try searching by:</p>
      <ul className="space-y-2">
        <li className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand/15 text-brand">
            <Package className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="font-semibold text-ink">SKU</div>
            <div className="text-xs">e.g. ANISBR-LBK-XS</div>
          </div>
        </li>
        <li className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand/15 text-brand">
            <MapPin className="h-3.5 w-3.5" />
          </span>
          <div>
            <div className="font-semibold text-ink">Location</div>
            <div className="text-xs font-mono">e.g. A01.B05.L02.S3</div>
          </div>
        </li>
      </ul>
    </div>
  )
}
