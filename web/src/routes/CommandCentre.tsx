import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Boxes,
  Gauge,
  AlertTriangle,
  Package,
  ChevronRight,
  Sparkles,
} from 'lucide-react'
import { Kpi } from '@/components/ui/Kpi'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useInventory } from '@/features/inventory/store'
import {
  allSlots,
  fmtN,
  fmtPct,
  perAisle,
  summarize,
  timeAgo,
} from '@/lib/inventory'
import { cn } from '@/lib/cn'

export function CommandCentre() {
  const inv = useInventory((s) => s.inventory)
  const loading = useInventory((s) => s.loading)
  const navigate = useNavigate()

  const summary = useMemo(() => (inv ? summarize(inv) : null), [inv])
  const aisles = useMemo(() => (inv ? perAisle(inv) : []), [inv])
  const lowStock = useMemo(() => {
    if (!inv) return []
    return allSlots(inv)
      .filter((s) => s.status === 'low')
      .sort((a, b) => a.totalUnits - b.totalUnits)
      .slice(0, 8)
  }, [inv])

  if (loading && !inv) return <SkeletonDashboard />
  if (!inv || !summary) return null

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Units in stock"
          value={fmtN(summary.totalUnits)}
          hint={`${fmtN(summary.distinctSkus)} distinct SKUs`}
          tone="brand"
          icon={<Package className="h-3.5 w-3.5" />}
          series={demoSeries(summary.totalUnits)}
        />
        <Kpi
          label="Bin fullness"
          value={summary.fullnessPct}
          unit="%"
          hint={`${fmtN(summary.stockedSlots)} of ${fmtN(summary.totalSlots)} slots`}
          tone={summary.fullnessPct >= 60 ? 'good' : summary.fullnessPct >= 35 ? 'warn' : 'bad'}
          icon={<Gauge className="h-3.5 w-3.5" />}
          series={demoSeries(summary.fullnessPct, 40)}
        />
        <Kpi
          label="Empty slots"
          value={fmtN(summary.emptySlots)}
          hint={`${fmtN(summary.emptyBays)} fully empty bays`}
          tone="bad"
          icon={<Boxes className="h-3.5 w-3.5" />}
          series={demoSeries(summary.emptySlots)}
        />
        <Kpi
          label="Low stock alerts"
          value={fmtN(summary.lowSlots)}
          hint="≤ 5 units"
          tone="warn"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          series={demoSeries(summary.lowSlots, 20)}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Low Stock + Active Alerts */}
        <Card className="xl:col-span-2">
          <CardHeader
            eyebrow="Replenishment"
            title="Low stock"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/inventory?status=low')}
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <CardBody className="!pt-1">
            {lowStock.length === 0 ? (
              <EmptyState
                icon={<Sparkles className="h-5 w-5" />}
                title="Nothing low"
                body="No bins are between 1 and 5 units. Stock levels look healthy."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {lowStock.map((slot) => (
                  <li key={slot.code}>
                    <button
                      type="button"
                      onClick={() => navigate(`/warehouse?loc=${slot.code}`)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 text-left transition hover:border-brand-ring/40 hover:bg-surface-2"
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-warn/15 text-warn">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs font-semibold text-ink">
                          {slot.code}
                        </div>
                        <div className="truncate text-[11px] text-muted">
                          {slot.skus[0]?.sku || '—'}
                          {slot.skus[0]?.name ? ` · ${slot.skus[0].name}` : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="tnum text-sm font-bold text-ink">
                          {slot.totalUnits}
                        </div>
                        <div className="text-[10px] text-muted">units</div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-subtle opacity-0 transition group-hover:opacity-100" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Operations" title="Sync status" />
          <CardBody>
            <SyncStatus generatedAt={inv.generatedAt} rowCount={inv.rowCount} />
          </CardBody>
        </Card>
      </div>

      {/* Aisle heatmap */}
      <Card>
        <CardHeader
          eyebrow="Warehouse"
          title="Aisle fullness"
          action={
            <Button variant="ghost" size="sm" onClick={() => navigate('/warehouse')}>
              Open map <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {aisles.map((a) => {
              const pct = a.total ? Math.round((a.stocked / a.total) * 100) : 0
              const tone =
                pct >= 60 ? 'good' : pct >= 35 ? 'warn' : pct === 0 ? 'subtle' : 'bad'
              return (
                <button
                  type="button"
                  key={a.aisle}
                  onClick={() => navigate(`/warehouse?aisle=${a.aisle}`)}
                  className="group flex flex-col gap-2 rounded-lg border border-line bg-surface-2/40 p-3 text-left transition hover:border-brand-ring/40 hover:bg-surface-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-ink">{a.aisle}</span>
                    <span
                      className={cn(
                        'tnum rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        tone === 'good' && 'bg-good/15 text-good',
                        tone === 'warn' && 'bg-warn/15 text-warn',
                        tone === 'bad' && 'bg-bad/15 text-bad',
                        tone === 'subtle' && 'bg-surface-3 text-subtle',
                      )}
                    >
                      {fmtPct(pct)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        tone === 'good' && 'bg-good',
                        tone === 'warn' && 'bg-warn',
                        tone === 'bad' && 'bg-bad',
                        tone === 'subtle' && 'bg-subtle/30',
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <span>{fmtN(a.totalUnits)} units</span>
                    {a.lowCount > 0 && (
                      <span className="text-warn">{a.lowCount} low</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function SyncStatus({
  generatedAt,
  rowCount,
}: {
  generatedAt: string
  rowCount: number
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="relative inline-flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-pulse-soft rounded-full bg-good/70" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-good" />
        </span>
        <div>
          <div className="text-sm font-semibold text-ink">Live</div>
          <div className="text-xs text-muted">
            {generatedAt ? `Synced ${timeAgo(generatedAt)}` : 'Awaiting first sync'}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-surface-2 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">Rows</div>
          <div className="tnum mt-0.5 text-base font-bold text-ink">{fmtN(rowCount)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted">Source</div>
          <div className="mt-0.5 text-base font-bold text-ink">PVX</div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-good/15 text-good">
        {icon}
      </span>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="max-w-sm text-xs text-muted">{body}</p>
    </div>
  )
}

function SkeletonDashboard() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl bg-surface/40 ring-1 ring-line"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl bg-surface/40 ring-1 ring-line" />
    </div>
  )
}

// Generate a plausible sparkline series so the cards look alive on first paint.
// Once we have time-series in the backend we'll swap these for real history.
function demoSeries(target: number, points = 24): number[] {
  const out: number[] = []
  let v = Math.max(target * 0.85, 1)
  for (let i = 0; i < points; i++) {
    v += (Math.random() - 0.45) * Math.max(target * 0.04, 1)
    out.push(Math.max(0, v))
  }
  out[out.length - 1] = Math.max(target, 0)
  return out
}
