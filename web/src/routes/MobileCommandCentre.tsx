// Mobile-only Command Centre — hero KPI + iOS-style grouped lists.
// Replaces the dense card grid the desktop version uses with a single-
// column scrollable flow that feels native on a phone.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, Boxes, ChevronRight, Package,
  Sparkles, TrendingUp, Check,
} from 'lucide-react'
import { ListGroup, ListRow } from '@/components/ui/ListGroup'
import { Sparkline } from '@/components/ui/Sparkline'
import { useInventory } from '@/features/inventory/store'
import {
  allSlots, fmtN, fmtPct, perAisle, perSku, summarize, timeAgo,
} from '@/lib/inventory'
import { fetchSyncStatus, type SyncRun } from '@/lib/api'
import { cn } from '@/lib/cn'

export function MobileCommandCentre() {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [runs, setRuns] = useState<SyncRun[]>([])
  useEffect(() => {
    fetchSyncStatus().then((r) => setRuns(r.runs)).catch(() => undefined)
  }, [])

  const summary = useMemo(() => (inv ? summarize(inv) : null), [inv])
  const lowStock = useMemo(() => {
    if (!inv) return []
    return allSlots(inv)
      .filter((s) => s.status === 'critical' || s.status === 'low')
      .sort((a, b) => a.totalUnits - b.totalUnits)
      .slice(0, 5)
  }, [inv])
  const topSkus = useMemo(() => (inv ? perSku(inv).slice(0, 5) : []), [inv])
  const aisles = useMemo(() => (inv ? perAisle(inv) : []), [inv])

  if (!inv || !summary) return null

  // Sparkline data — fake history until we have time-series in the backend
  const series = demoSeries(summary.totalUnits)

  return (
    <div className="space-y-6 pb-4">
      {/* Hero KPI — full-bleed feel with a giant number */}
      <section className="-mx-4 px-5 pt-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Units in stock
        </div>
        <div className="flex items-baseline gap-3">
          <div className="tnum text-5xl font-bold leading-none tracking-tight text-ink">
            {fmtN(summary.totalUnits)}
          </div>
          <div className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-semibold text-good">
            <TrendingUp className="h-3 w-3" />
            live
          </div>
        </div>
        <div className="mt-1 text-[12px] text-muted">
          {fmtN(summary.distinctSkus)} distinct SKUs · synced{' '}
          {inv.generatedAt ? timeAgo(inv.generatedAt) : '—'}
        </div>
        <div className="mt-3 h-12">
          <Sparkline data={series} tone="brand" width={340} height={48} />
        </div>
      </section>

      {/* At-a-glance stats — three side-by-side number tiles */}
      <section className="-mx-4 grid grid-cols-3 divide-x divide-line/60 border-y border-line bg-surface/60">
        <StatTile label="Bin fullness" value={`${summary.fullnessPct}%`} tone="brand" />
        <StatTile label="Empty slots" value={fmtN(summary.emptySlots)} tone="info" />
        <StatTile label="Low" value={fmtN(summary.lowSlots)} tone="warn" />
      </section>

      {/* Replenishment list — iOS Settings style */}
      <ListGroup
        title="Needs attention"
        footnote={
          lowStock.length === 0
            ? 'Nothing low or critical right now.'
            : 'Tap to walk straight to the box. Pull from the suggested source in Replenish.'
        }
      >
        {lowStock.length === 0 ? (
          <ListRow
            leading={
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-good/15 text-good">
                <Sparkles className="h-4 w-4" />
              </span>
            }
            title="All healthy"
            subtitle="No bins below 5 units"
          />
        ) : (
          lowStock.map((slot) => (
            <ListRow
              key={slot.code}
              leading={
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-lg',
                    slot.status === 'critical' ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn',
                  )}
                >
                  <AlertTriangle className="h-4 w-4" />
                </span>
              }
              title={<span className="font-mono">{slot.code}</span>}
              subtitle={
                slot.skus[0]
                  ? `${slot.skus[0].sku} · ${slot.skus[0].name || '—'}`
                  : 'Empty box'
              }
              trailing={
                <span className="flex flex-col items-end">
                  <span
                    className={cn(
                      'tnum text-base font-bold',
                      slot.status === 'critical' ? 'text-bad' : 'text-warn',
                    )}
                  >
                    {slot.totalUnits}
                  </span>
                  <span className="text-[10px] text-muted">units</span>
                </span>
              }
              onClick={() =>
                navigate(
                  `/warehouse/${slot.aisle}?slot=${encodeURIComponent(slot.code)}`,
                )
              }
            />
          ))
        )}
      </ListGroup>

      {/* Top SKUs list */}
      <ListGroup title="Top SKUs by units">
        {topSkus.map((s, i) => (
          <ListRow
            key={s.sku}
            leading={
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-good/15 font-mono text-[11px] font-bold text-good">
                #{i + 1}
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
            onClick={() => navigate(`/inventory?q=${encodeURIComponent(s.sku)}`)}
          />
        ))}
      </ListGroup>

      {/* Aisle fullness — compact 2-col chips */}
      <section>
        <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Aisles
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {aisles.map((a) => {
            const pct = a.total ? Math.round((a.stocked / a.total) * 100) : 0
            const tone =
              pct >= 60 ? 'good' : pct >= 35 ? 'warn' : pct === 0 ? 'subtle' : 'bad'
            return (
              <button
                key={a.aisle}
                type="button"
                onClick={() => navigate(`/warehouse/${a.aisle}`)}
                className="flex flex-col gap-1.5 rounded-lg bg-surface/60 p-3 text-left active:bg-surface-2"
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
                      'h-full rounded-full',
                      tone === 'good' && 'bg-good',
                      tone === 'warn' && 'bg-warn',
                      tone === 'bad' && 'bg-bad',
                      tone === 'subtle' && 'bg-subtle/30',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted">{fmtN(a.totalUnits)} units</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Sync history — compact list with chevron */}
      <ListGroup title="Recent syncs">
        {runs.slice(0, 4).map((r) => {
          const ok = r.status === 'ok'
          return (
            <ListRow
              key={r.id}
              leading={
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-lg',
                    ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad',
                  )}
                >
                  {ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                </span>
              }
              title={`#${r.id}`}
              subtitle={ok ? `${fmtN(r.row_count)} rows` : r.error_text?.slice(0, 60) || 'failed'}
              trailing={timeAgo(r.started_at)}
              onClick={() => navigate('/reports')}
            />
          )
        })}
        {runs.length === 0 && (
          <ListRow
            leading={
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-surface-2 text-muted">
                <Package className="h-4 w-4" />
              </span>
            }
            title="No syncs yet"
            subtitle="Tap the live indicator in the topbar to sync"
          />
        )}
      </ListGroup>

      {/* Quick actions strip */}
      <section className="-mx-4 grid grid-cols-3 gap-px bg-line/60">
        <QuickAction
          to="/scan"
          icon={<Boxes className="h-5 w-5" />}
          label="Scan"
          onClick={() => navigate('/scan')}
        />
        <QuickAction
          to="/pick"
          icon={<ArrowRight className="h-5 w-5" />}
          label="Pick"
          onClick={() => navigate('/pick')}
        />
        <QuickAction
          to="/replenish"
          icon={<ArrowDownToLine className="h-5 w-5" />}
          label="Replenish"
          onClick={() => navigate('/replenish')}
        />
      </section>

      {/* Footer link to alerts */}
      <button
        type="button"
        onClick={() => navigate('/alerts')}
        className="flex w-full items-center justify-between gap-2 px-1 py-2 text-[13px] font-semibold text-brand active:text-brand/80"
      >
        See all alerts
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'brand' | 'info' | 'warn'
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div
        className={cn(
          'tnum text-2xl font-bold',
          tone === 'brand' && 'text-ink',
          tone === 'info' && 'text-info',
          tone === 'warn' && 'text-warn',
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  )
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  to: string
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1 bg-surface/60 px-2 py-4 text-[12px] font-semibold text-ink active:bg-surface-2"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/15 text-brand">
        {icon}
      </span>
      {label}
    </button>
  )
}

function demoSeries(target: number, points = 32): number[] {
  const out: number[] = []
  let v = Math.max(target * 0.85, 1)
  for (let i = 0; i < points; i++) {
    v += (Math.random() - 0.45) * Math.max(target * 0.04, 1)
    out.push(Math.max(0, v))
  }
  out[out.length - 1] = Math.max(target, 0)
  return out
}
