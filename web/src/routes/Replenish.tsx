import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronRight,
  Search,
  X,
  PackageCheck,
  PackageX,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useInventory } from '@/features/inventory/store'
import { fmtN } from '@/lib/inventory'
import {
  emptiesByAisle,
  emptySlots,
  pullSuggestions,
  type PullSuggestion,
} from '@/lib/replen'
import { cn } from '@/lib/cn'

type Mode = 'pull' | 'putaway'

/**
 * /replenish — two-mode workflow tool:
 *
 *  • Pull mode  — find every low/critical slot that needs topping up and
 *                 suggest where to pull stock from (other slots with the
 *                 same SKU; same-aisle sources first).
 *  • Put-away   — list empty slots grouped by aisle so a receiver can pick
 *                 where to drop incoming pallets.
 */
export function Replenish() {
  const inv = useInventory((s) => s.inventory)
  const [mode, setMode] = useState<Mode>('pull')
  const [query, setQuery] = useState('')

  if (!inv) return null

  return (
    <div className="space-y-4">
      {/* Mode toggle — chunky segmented control */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode('pull')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            mode === 'pull'
              ? 'bg-brand text-white shadow-glow'
              : 'text-muted hover:bg-surface-2 hover:text-ink',
          )}
        >
          <ArrowDownToLine className="h-4 w-4" />
          Replenish
        </button>
        <button
          type="button"
          onClick={() => setMode('putaway')}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition',
            mode === 'putaway'
              ? 'bg-brand text-white shadow-glow'
              : 'text-muted hover:bg-surface-2 hover:text-ink',
          )}
        >
          <ArrowUpFromLine className="h-4 w-4" />
          Put-away
        </button>
      </div>

      <SearchBar value={query} onChange={setQuery} placeholder={
        mode === 'pull' ? 'Filter SKU or location' : 'Filter aisle or slot'
      } />

      {mode === 'pull' ? <PullView query={query} /> : <PutAwayView query={query} />}
    </div>
  )
}

function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-line bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function PullView({ query }: { query: string }) {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()

  const suggestions = useMemo(() => (inv ? pullSuggestions(inv) : []), [inv])
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return suggestions
    return suggestions.filter((s) => {
      if (s.target.code.toLowerCase().includes(q)) return true
      for (const e of s.target.skus) {
        if (e.sku.toLowerCase().includes(q)) return true
        if (e.name && e.name.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [suggestions, q])

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<PackageCheck className="h-5 w-5" />}
        title={q ? 'No matches' : 'Nothing to replenish'}
        body={
          q
            ? `Nothing matching "${query}" needs replenishment right now.`
            : 'Every slot is at healthy stock levels. Nothing to pull.'
        }
        tone="good"
      />
    )
  }

  return (
    <ul className="space-y-2">
      {filtered.slice(0, 100).map((s) => (
        <PullCard key={s.target.code} suggestion={s} onJump={(code) => {
          // Jump to the source location in the warehouse view with the
          // exact source slot pre-selected so the picker sees which box
          // to pull from — not just the aisle.
          const aisle = /^A0*(\d+)/.exec(code)?.[1]
          if (aisle) {
            const aisleId = `A${String(aisle).padStart(2, '0')}`
            navigate(`/warehouse/${aisleId}?slot=${encodeURIComponent(code)}`)
          }
        }} />
      ))}
      {filtered.length > 100 && (
        <li className="px-2 py-2 text-center text-[11px] text-muted">
          Showing first 100. Refine the search to narrow down.
        </li>
      )}
    </ul>
  )
}

function PullCard({
  suggestion,
  onJump,
}: {
  suggestion: PullSuggestion
  onJump: (code: string) => void
}) {
  const { target, sources } = suggestion
  const isCritical = target.status === 'critical'
  const primarySku = target.skus[0]
  return (
    <li>
      <Card>
        <CardBody className="!p-0">
          {/* Target header */}
          <div className="flex items-center gap-3 border-b border-line bg-surface-2/40 px-4 py-3">
            <span
              className={cn(
                'grid h-10 w-10 flex-shrink-0 place-items-center rounded-md font-bold',
                isCritical ? 'bg-bad/20 text-bad' : 'bg-warn/20 text-warn',
              )}
            >
              {target.totalUnits}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-ink">{target.code}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    isCritical ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn',
                  )}
                >
                  {isCritical ? 'Critical' : 'Low'}
                </span>
              </div>
              <div className="truncate text-[11px] text-muted">
                {primarySku?.sku || '—'}
                {primarySku?.name ? ` · ${primarySku.name}` : ''}
              </div>
            </div>
          </div>

          {/* Sources */}
          {sources.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-3 text-sm">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-subtle/15 text-subtle">
                <PackageX className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">No source available</div>
                <p className="text-[11px] text-muted">
                  No other location holds healthy stock of this SKU. Mark for purchase order or
                  zero-stock report.
                </p>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-line/60">
              {sources.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => onJump(s.code)}
                    className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2"
                  >
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-good/15 text-good">
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-xs font-semibold text-ink">
                        {s.code}
                      </div>
                      <div className="text-[10px] text-muted">
                        {s.aisle === target.aisle ? 'Same aisle' : `Aisle ${s.aisle}`}
                        {' · '}pull from this slot
                      </div>
                    </div>
                    <div className="tnum text-sm font-bold text-good">{fmtN(s.qty)}</div>
                    <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </li>
  )
}

function PutAwayView({ query }: { query: string }) {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const grouped = useMemo(() => {
    if (!inv) return []
    return emptiesByAisle(emptySlots(inv))
  }, [inv])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return grouped
    return grouped
      .map((g) => ({
        aisle: g.aisle,
        slots: g.slots.filter(
          (s) => s.code.toLowerCase().includes(q) || s.aisle.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.slots.length > 0)
  }, [grouped, q])

  const totalEmpty = filtered.reduce((s, g) => s + g.slots.length, 0)

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={<PackageX className="h-5 w-5" />}
        title={q ? 'No matches' : 'Warehouse full'}
        body={
          q
            ? `No empty slots matching "${query}".`
            : 'No empty slots available. Receive against existing aisles or audit for orphan stock.'
        }
        tone="bad"
      />
    )
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardBody className="!py-3 flex items-center gap-3">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-info/15 text-info">
            <PackageX className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Available for put-away
            </div>
            <div className="tnum text-xl font-bold text-info">
              {fmtN(totalEmpty)} empty slots
            </div>
          </div>
          <div className="text-right text-[11px] text-muted">
            across {filtered.length} aisle{filtered.length === 1 ? '' : 's'}
          </div>
        </CardBody>
      </Card>

      {filtered.map((g) => (
        <Card key={g.aisle}>
          <CardHeader
            eyebrow="Aisle"
            title={
              <span className="flex items-baseline gap-2">
                <span className="font-mono">{g.aisle}</span>
                <span className="text-xs font-normal text-muted">
                  {fmtN(g.slots.length)} empty
                </span>
              </span>
            }
            action={
              <button
                type="button"
                onClick={() => navigate(`/warehouse/${g.aisle}`)}
                className="text-[11px] font-semibold text-brand hover:underline"
              >
                Walk aisle →
              </button>
            }
          />
          <CardBody className="!pt-2">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {g.slots.slice(0, 48).map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() =>
                    navigate(
                      `/warehouse/${g.aisle}?slot=${encodeURIComponent(s.code)}`,
                    )
                  }
                  title={s.code}
                  className="group flex flex-col items-start gap-1 rounded-lg border border-info/20 bg-info/10 p-2 text-left transition hover:border-info/40 hover:bg-info/15"
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-info">
                      {s.bay}
                    </span>
                    <span className="font-mono text-[10px] text-info/70">{s.level}</span>
                  </div>
                  <span className="font-mono text-[10px] text-info/70">{s.slot}</span>
                </button>
              ))}
            </div>
            {g.slots.length > 48 && (
              <div className="mt-2 text-center text-[11px] text-muted">
                +{g.slots.length - 48} more empty slots in {g.aisle}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode
  title: string
  body: string
  tone: 'good' | 'bad' | 'warn'
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span
            className={cn(
              'grid h-12 w-12 place-items-center rounded-xl',
              tone === 'good' && 'bg-good/15 text-good',
              tone === 'bad' && 'bg-bad/15 text-bad',
              tone === 'warn' && 'bg-warn/15 text-warn',
            )}
          >
            {icon}
          </span>
          <div className="text-base font-semibold text-ink">{title}</div>
          <p className="max-w-sm text-sm text-muted">{body}</p>
        </div>
      </CardBody>
    </Card>
  )
}
