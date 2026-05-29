import { useEffect, useRef, useState } from 'react'
import { Package, PackageCheck, Tv, Trophy, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import {
  fetchLeaderboard,
  type LeaderboardResponse,
  type LeaderboardRow,
  type LeaderboardWindow,
} from '@/lib/api'
import { BADGES, badgesFor } from '@/lib/badges'
import { fmtN, timeAgo } from '@/lib/inventory'

type Mode = 'pick' | 'pack'

const WINDOWS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'WTD' },
  { key: 'month', label: 'MTD' },
  { key: 'ytd', label: 'YTD' },
]

const MODES: { key: Mode; label: string; icon: typeof Package }[] = [
  { key: 'pick', label: 'Picking', icon: Package },
  { key: 'pack', label: 'Packing', icon: PackageCheck },
]

interface MetricCfg {
  primary: keyof LeaderboardRow
  primaryLabel: string
  primaryUnit: string
}

const METRICS: Record<Mode, MetricCfg> = {
  pick: {
    primary: 'items_picked',
    primaryLabel: 'Items picked',
    primaryUnit: 'items',
  },
  pack: {
    primary: 'items_despatched',
    primaryLabel: 'Items packed',
    primaryUnit: 'items',
  },
}

export function LeaderboardWidget() {
  const navigate = useNavigate()
  const [win, setWin] = useState<LeaderboardWindow>('today')
  const [mode, setMode] = useState<Mode>('pick')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const openTv = () => navigate('/leaderboard')

  useEffect(() => {
    if (unsupported) return
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    let cancelled = false
    setErr(null)
    fetchLeaderboard(win, ctl.signal)
      .then((payload) => {
        if (cancelled) return
        if (payload === null) {
          setUnsupported(true)
          return
        }
        setData(payload)
      })
      .catch((e: Error) => {
        if (cancelled || e.name === 'AbortError') return
        setErr(e.message)
      })
    return () => {
      cancelled = true
      ctl.abort()
    }
  }, [win, unsupported])

  if (unsupported) return null

  const metric = METRICS[mode]

  // Sort + filter rows by the active metric
  const ranked = data
    ? [...data.rows]
        .filter((r) => (r[metric.primary] as number) > 0)
        .sort((a, b) => (b[metric.primary] as number) - (a[metric.primary] as number))
        .slice(0, 6)
    : []

  return (
    <Card
      className="group cursor-pointer transition hover:ring-1 hover:ring-brand-ring/40"
      onClick={openTv}
      role="link"
      aria-label="Open warehouse TV leaderboard"
      tabIndex={0}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openTv()
        }
      }}
    >
      <CardHeader
        eyebrow={mode === 'pick' ? 'Picking' : 'Packing'}
        title="Warehouse leaderboard"
        action={
          <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pick / Pack mode switch */}
            <div
              className="inline-flex rounded-lg border border-line bg-surface/40 p-0.5"
              role="tablist"
              aria-label="Pick or pack"
            >
              {MODES.map((m) => {
                const Icon = m.icon
                return (
                  <button
                    key={m.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.key}
                    onClick={() => setMode(m.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                      mode === m.key
                        ? 'bg-brand-grad text-white shadow-glow'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                )
              })}
            </div>
            {/* Time window switch */}
            <div
              className="inline-flex rounded-lg border border-line bg-surface/40 p-0.5"
              role="tablist"
              aria-label="Time window"
            >
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  type="button"
                  role="tab"
                  aria-selected={win === w.key}
                  onClick={() => setWin(w.key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                    win === w.key
                      ? 'bg-surface-2 text-ink ring-1 ring-line-strong'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openTv()
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface/40 px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-brand-ring/40 hover:text-ink"
              aria-label="Open TV view"
              title="Full-screen TV view"
            >
              <Tv className="h-3.5 w-3.5" />
              TV
            </button>
          </div>
        }
      />
      <CardBody className="!pt-1">
        {err ? (
          <EmptyState title="Couldn't load leaderboard" body={err} tone="bad" />
        ) : !data ? (
          <SkeletonRows />
        ) : !data.configured ? (
          <EmptyState
            title={`${win === 'week' ? 'Week-to-date' : win === 'month' ? 'Month-to-date' : win === 'ytd' ? 'Year-to-date' : 'Today'} template isn't configured`}
            body={
              <>
                Set <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                  PVX_PICK_TEMPLATE_{win === 'week' ? 'WTD' : win === 'month' ? 'MTD' : win === 'ytd' ? 'YTD' : 'TODAY'}
                </code>{' '}
                on the server to a PVX User-activity template filtered to this window.
              </>
            }
          />
        ) : ranked.length === 0 ? (
          <EmptyState
            title={`No ${mode === 'pick' ? 'picking' : 'packing'} activity ${win === 'today' ? 'yet today' : win === 'week' ? 'this week' : win === 'ytd' ? 'this year' : 'this month'}`}
            body={
              data.latest
                ? `Last refreshed ${timeAgo(data.latest)}.`
                : 'Awaiting first sync.'
            }
          />
        ) : (
          <RankedList rows={ranked} metric={metric} latest={data.latest} win={win} />
        )}
      </CardBody>
    </Card>
  )
}

function RankedList({
  rows,
  metric,
  latest,
  win,
}: {
  rows: LeaderboardRow[]
  metric: MetricCfg
  latest: string | null
  win: LeaderboardWindow
}) {
  const max = (rows[0][metric.primary] as number) || 1
  return (
    <>
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const v = r[metric.primary] as number
          const pct = Math.max(4, Math.round((v / max) * 100))
          const badges = badgesFor(r, i + 1, win)
          return (
            <li
              key={r.picker}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 transition hover:border-brand-ring/40 hover:bg-surface-2"
            >
              <span
                className={cn(
                  'grid h-8 w-8 flex-shrink-0 place-items-center rounded-md font-mono text-xs font-bold',
                  i === 0
                    ? 'bg-brand-grad text-white shadow-glow'
                    : i === 1
                      ? 'bg-good/15 text-good'
                      : i === 2
                        ? 'bg-warn/15 text-warn'
                        : 'bg-surface-3 text-muted',
                )}
              >
                {i === 0 ? <Crown className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-ink">
                    {r.picker}
                  </span>
                  {badges.slice(0, 3).map((b) => (
                    <img
                      key={b}
                      src={BADGES[b].imageUrl}
                      alt={BADGES[b].label}
                      title={`${BADGES[b].label} — ${BADGES[b].description}`}
                      className="h-5 w-5 flex-shrink-0"
                      draggable={false}
                    />
                  ))}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-brand-grad transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-xl font-bold text-ink">
                  {fmtN(v)}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {metric.primaryUnit}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {latest ? (
        <p className="mt-3 text-right text-[11px] text-muted">
          {metric.primaryLabel} · refreshed {timeAgo(latest)}
        </p>
      ) : null}
    </>
  )
}

function SkeletonRows() {
  return (
    <ul className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <li
          key={i}
          className="h-14 animate-pulse rounded-lg border border-line bg-surface/40"
        />
      ))}
    </ul>
  )
}

function EmptyState({
  title,
  body,
  tone,
}: {
  title: string
  body: React.ReactNode
  tone?: 'bad'
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <span
        className={cn(
          'grid h-10 w-10 place-items-center rounded-xl',
          tone === 'bad' ? 'bg-bad/15 text-bad' : 'bg-brand-ring/15 text-brand-ring',
        )}
      >
        <Trophy className="h-5 w-5" />
      </span>
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="max-w-sm text-xs text-muted">{body}</p>
    </div>
  )
}
