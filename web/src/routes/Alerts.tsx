import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CircleSlash2,
  XCircle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useInventory } from '@/features/inventory/store'
import { perSku, perAisle, fmtN, timeAgo } from '@/lib/inventory'
import { fetchSyncStatus, type SyncRun } from '@/lib/api'
import { cn } from '@/lib/cn'

type AlertTab = 'all' | 'low' | 'zero' | 'aisle' | 'sync'

export function Alerts() {
  const inv = useInventory((s) => s.inventory)
  const [tab, setTab] = useState<AlertTab>('all')
  const [runs, setRuns] = useState<SyncRun[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    fetchSyncStatus().then((r) => setRuns(r.runs)).catch(() => undefined)
  }, [])

  const skus = useMemo(() => (inv ? perSku(inv) : []), [inv])
  const aisles = useMemo(() => (inv ? perAisle(inv) : []), [inv])

  const lowSkus = useMemo(
    () => skus.filter((s) => s.status === 'low').slice(0, 100),
    [skus],
  )
  const zeroSkus = useMemo(
    () => skus.filter((s) => s.status === 'empty').slice(0, 100),
    [skus],
  )
  const lowAisles = useMemo(
    () =>
      aisles
        .filter((a) => a.total > 0 && a.stocked / a.total < 0.1)
        .sort((a, b) => a.stocked / a.total - b.stocked / b.total),
    [aisles],
  )
  const failedRuns = useMemo(() => runs.filter((r) => r.status !== 'ok'), [runs])

  const counts = {
    low: lowSkus.length,
    zero: zeroSkus.length,
    aisle: lowAisles.length,
    sync: failedRuns.length,
  }
  const total = counts.low + counts.zero + counts.aisle + counts.sync

  if (!inv) return null

  const tabs: { key: AlertTab; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: total },
    { key: 'low', label: 'Low stock', n: counts.low },
    { key: 'zero', label: 'Zero stock', n: counts.zero },
    { key: 'aisle', label: 'Empty aisles', n: counts.aisle },
    { key: 'sync', label: 'Sync failures', n: counts.sync },
  ]

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Low stock" n={counts.low} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Zero stock" n={counts.zero} tone="bad" icon={<CircleSlash2 className="h-4 w-4" />} />
        <SummaryTile label="Empty aisles" n={counts.aisle} tone="bad" icon={<AlertTriangle className="h-4 w-4" />} />
        <SummaryTile label="Sync failures" n={counts.sync} tone={counts.sync > 0 ? 'bad' : 'good'} icon={<XCircle className="h-4 w-4" />} />
      </div>

      {/* Tab strip */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const active = t.key === tab
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                active
                  ? 'border-brand-ring/40 bg-brand/15 text-brand'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <span>{t.label}</span>
              <span className="tnum rounded-full bg-black/20 px-1.5 py-px text-[10px] font-bold">
                {t.n}
              </span>
            </button>
          )
        })}
      </div>

      {total === 0 && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-good/15 text-good">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div className="text-base font-semibold text-ink">All clear</div>
              <p className="max-w-xs text-sm text-muted">
                No active alerts. Stock levels are healthy and the last sync ran cleanly.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {(tab === 'all' || tab === 'low') && lowSkus.length > 0 && (
        <Card>
          <CardHeader
            eyebrow="Low stock"
            title={`${counts.low} SKU${counts.low === 1 ? '' : 's'} below threshold`}
          />
          <CardBody className="!p-0">
            <ul className="divide-y divide-line">
              {lowSkus.map((s) => (
                <li key={s.sku}>
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory?q=${encodeURIComponent(s.sku)}`)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
                  >
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-warn/15 text-warn">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm font-semibold text-ink">{s.sku}</div>
                      <div className="truncate text-[11px] text-muted">{s.name || '—'}</div>
                    </div>
                    <div className="text-right">
                      <div className="tnum text-sm font-bold text-warn">{fmtN(s.totalUnits)}</div>
                      <div className="text-[10px] text-muted">{s.locations} loc</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {(tab === 'all' || tab === 'zero') && zeroSkus.length > 0 && (
        <Card>
          <CardHeader
            eyebrow="Zero stock"
            title={`${counts.zero} SKU${counts.zero === 1 ? '' : 's'} at zero`}
          />
          <CardBody className="!p-0">
            <ul className="divide-y divide-line">
              {zeroSkus.slice(0, tab === 'zero' ? 100 : 8).map((s) => (
                <li key={s.sku}>
                  <button
                    type="button"
                    onClick={() => navigate(`/inventory?q=${encodeURIComponent(s.sku)}`)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
                  >
                    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-bad/15 text-bad">
                      <CircleSlash2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm font-semibold text-ink">{s.sku}</div>
                      <div className="truncate text-[11px] text-muted">{s.name || '—'}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                  </button>
                </li>
              ))}
            </ul>
            {tab === 'all' && zeroSkus.length > 8 && (
              <div className="border-t border-line bg-surface-2/40 px-5 py-2 text-center text-[11px] text-muted">
                +{zeroSkus.length - 8} more · tap “Zero stock” tab to see all
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {(tab === 'all' || tab === 'aisle') && lowAisles.length > 0 && (
        <Card>
          <CardHeader
            eyebrow="Aisle health"
            title={`${counts.aisle} aisle${counts.aisle === 1 ? '' : 's'} below 10% stocked`}
          />
          <CardBody>
            <ul className="grid gap-2 sm:grid-cols-2">
              {lowAisles.map((a) => {
                const pct = a.total ? Math.round((a.stocked / a.total) * 100) : 0
                return (
                  <li key={a.aisle}>
                    <button
                      type="button"
                      onClick={() => navigate(`/warehouse/${a.aisle}`)}
                      className="group flex w-full items-center gap-3 rounded-lg border border-line bg-surface-2/40 p-3 text-left transition hover:border-bad/40"
                    >
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-bad/15 font-mono text-xs font-bold text-bad">
                        {a.aisle}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-ink">{pct}% stocked</div>
                        <div className="text-[11px] text-muted">{fmtN(a.totalUnits)} units</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {(tab === 'all' || tab === 'sync') && failedRuns.length > 0 && (
        <Card>
          <CardHeader
            eyebrow="Sync failures"
            title={`${counts.sync} recent failure${counts.sync === 1 ? '' : 's'}`}
          />
          <CardBody className="!p-0">
            <ul className="divide-y divide-line">
              {failedRuns.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-bad/15 text-bad">
                    <XCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">
                      Run #{r.id} failed
                    </div>
                    <div className="line-clamp-2 text-[11px] text-muted">
                      {r.error_text || 'No error text'}
                    </div>
                    <div className="mt-0.5 text-[10px] text-subtle">
                      {timeAgo(r.started_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({
  label,
  n,
  tone,
  icon,
}: {
  label: string
  n: number
  tone: 'warn' | 'bad' | 'good'
  icon: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface-2/40 p-3',
        tone === 'warn' && 'border-warn/30',
        tone === 'bad' && 'border-bad/30',
        tone === 'good' && 'border-good/30',
      )}
    >
      <span
        className={cn(
          'grid h-9 w-9 flex-shrink-0 place-items-center rounded-md',
          tone === 'warn' && 'bg-warn/15 text-warn',
          tone === 'bad' && 'bg-bad/15 text-bad',
          tone === 'good' && 'bg-good/15 text-good',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
        <div className="tnum text-xl font-bold text-ink">{fmtN(n)}</div>
      </div>
    </div>
  )
}
