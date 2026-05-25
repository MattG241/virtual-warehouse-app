import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  FileText,
  AlertTriangle,
  CircleSlash2,
  LayoutList,
  RefreshCw,
  Check,
  XCircle,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Sparkline } from '@/components/ui/Sparkline'
import { useInventory } from '@/features/inventory/store'
import { fetchSyncStatus, syncNow, type SyncRun } from '@/lib/api'
import { fmtN, timeAgo } from '@/lib/inventory'
import { cn } from '@/lib/cn'

interface ExportItem {
  href: string
  title: string
  desc: string
  icon: React.ReactNode
  filename: string
  tone: 'brand' | 'warn' | 'bad' | 'good'
}

const EXPORTS: ExportItem[] = [
  {
    href: '/api/export/snapshot.csv',
    title: 'Full snapshot',
    desc: 'Every stocked item × location, with barcodes and metadata.',
    icon: <FileText className="h-5 w-5" />,
    filename: 'snapshot.csv',
    tone: 'brand',
  },
  {
    href: '/api/export/low-stock.csv?threshold=5',
    title: 'Low stock (≤5 units)',
    desc: 'SKUs and locations sitting below the replenishment threshold.',
    icon: <AlertTriangle className="h-5 w-5" />,
    filename: 'low-stock.csv',
    tone: 'warn',
  },
  {
    href: '/api/export/zero-stock-items.csv',
    title: 'Zero stock SKUs',
    desc: 'Items currently at zero on hand anywhere in the warehouse.',
    icon: <CircleSlash2 className="h-5 w-5" />,
    filename: 'zero-stock.csv',
    tone: 'bad',
  },
  {
    href: '/api/export/by-aisle.csv',
    title: 'By aisle',
    desc: 'Aggregated totals + box occupancy per aisle.',
    icon: <LayoutList className="h-5 w-5" />,
    filename: 'by-aisle.csv',
    tone: 'good',
  },
]

export function Reports() {
  const inv = useInventory((s) => s.inventory)
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetchSyncStatus()
      setRuns(r.runs)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sparkRows = useMemo(
    () => runs.slice().reverse().map((r) => r.row_count || 0),
    [runs],
  )

  const okRuns = runs.filter((r) => r.status === 'ok').length
  const failedRuns = runs.filter((r) => r.status !== 'ok').length

  return (
    <div className="space-y-4">
      {/* Sync status strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="!pt-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Last sync
            </div>
            <div className="mt-1 text-lg font-bold text-ink">
              {inv?.generatedAt ? timeAgo(inv.generatedAt) : 'never'}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              {inv?.rowCount != null ? `${fmtN(inv.rowCount)} rows` : '—'}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!pt-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                  Recent runs
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <span className="text-lg font-bold text-good">{okRuns} ok</span>
                  {failedRuns > 0 && (
                    <span className="text-lg font-bold text-bad">{failedRuns} failed</span>
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted">last {runs.length || 0} runs</div>
              </div>
              {sparkRows.length > 1 && (
                <Sparkline data={sparkRows} tone="brand" width={100} height={40} />
              )}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="!pt-5 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Refresh
              </div>
              <div className="mt-1 text-sm text-muted">Trigger a sync now</div>
            </div>
            <Button
              variant="primary"
              size="md"
              icon={<RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />}
              disabled={syncing}
              onClick={async () => {
                setSyncing(true)
                try {
                  await syncNow()
                  await load()
                } catch {
                  /* surfaced by sync-status */
                } finally {
                  setSyncing(false)
                }
              }}
            >
              Sync
            </Button>
          </CardBody>
        </Card>
      </div>

      {/* CSV exports grid */}
      <Card>
        <CardHeader eyebrow="Exports" title="Download CSV reports" />
        <CardBody>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {EXPORTS.map((e) => (
              <li key={e.href}>
                <a
                  href={e.href}
                  download={e.filename}
                  className="group flex items-start gap-4 rounded-xl border border-line bg-surface-2/40 p-4 transition hover:border-brand-ring/40 hover:bg-surface-2"
                >
                  <span
                    className={cn(
                      'grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg',
                      e.tone === 'brand' && 'bg-brand/15 text-brand',
                      e.tone === 'warn' && 'bg-warn/15 text-warn',
                      e.tone === 'bad' && 'bg-bad/15 text-bad',
                      e.tone === 'good' && 'bg-good/15 text-good',
                    )}
                  >
                    {e.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink">{e.title}</div>
                    <p className="mt-0.5 text-xs text-muted">{e.desc}</p>
                  </div>
                  <Download className="h-4 w-4 flex-shrink-0 self-center text-subtle transition group-hover:translate-y-0.5 group-hover:text-ink" />
                </a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Sync history */}
      <Card>
        <CardHeader eyebrow="Activity" title="Sync history" />
        <CardBody className="!p-0">
          {loading ? (
            <div className="space-y-2 p-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted">No sync runs yet.</div>
          ) : (
            <ul className="divide-y divide-line">
              {runs.map((r) => {
                const ok = r.status === 'ok'
                const duration =
                  r.finished_at && r.started_at
                    ? Math.max(
                        0,
                        Math.round(
                          (new Date(r.finished_at).getTime() -
                            new Date(r.started_at).getTime()) /
                            1000,
                        ),
                      )
                    : null
                return (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-5 py-3 text-sm"
                  >
                    <span
                      className={cn(
                        'grid h-8 w-8 flex-shrink-0 place-items-center rounded-md',
                        ok ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad',
                      )}
                    >
                      {ok ? <Check className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-xs text-muted">#{r.id}</span>
                        <span className="text-sm font-semibold text-ink">
                          {ok
                            ? `${fmtN(r.row_count)} rows`
                            : r.error_text?.slice(0, 80) || 'failed'}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        {timeAgo(r.started_at)}
                        {duration != null && ` · ${duration}s`}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
