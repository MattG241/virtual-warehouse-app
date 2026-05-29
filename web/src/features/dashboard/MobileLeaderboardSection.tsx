import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Package, PackageCheck, ChevronRight } from 'lucide-react'
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

interface MetricCfg {
  primary: keyof LeaderboardRow
  unit: string
  label: string
}

const METRICS: Record<Mode, MetricCfg> = {
  pick: {
    primary: 'items_picked',
    unit: 'items',
    label: 'Items picked',
  },
  pack: {
    primary: 'items_despatched',
    unit: 'items',
    label: 'Items packed',
  },
}

export function MobileLeaderboardSection() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('pick')
  const [win, setWin] = useState<LeaderboardWindow>('today')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (unsupported) return
    abortRef.current?.abort()
    const ctl = new AbortController()
    abortRef.current = ctl
    let cancelled = false
    fetchLeaderboard(win, ctl.signal)
      .then((payload) => {
        if (cancelled) return
        if (payload === null) {
          setUnsupported(true)
          return
        }
        setData(payload)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      ctl.abort()
    }
  }, [win, unsupported])

  if (unsupported) return null

  const metric = METRICS[mode]
  const ranked = data
    ? [...data.rows]
        .filter((r) => (r[metric.primary] as number) > 0)
        .sort((a, b) => (b[metric.primary] as number) - (a[metric.primary] as number))
        .slice(0, 5)
    : []
  const max = (ranked[0]?.[metric.primary] as number) || 1

  const winLabel =
    win === 'today' ? 'today' : win === 'week' ? 'this week' : win === 'ytd' ? 'this year' : 'this month'
  const modeLabel = mode === 'pick' ? 'picking' : 'packing'

  return (
    <section>
      {/* Heading + jump-to-TV chevron */}
      <button
        type="button"
        onClick={() => navigate('/leaderboard')}
        className="mb-2 flex w-full items-end justify-between px-1"
        aria-label="Open warehouse TV leaderboard"
      >
        <div className="text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            {mode === 'pick' ? 'Picking' : 'Packing'}
          </p>
          <h3 className="text-sm font-semibold text-ink">
            Warehouse leaderboard
          </h3>
        </div>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
          TV view <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Pick/Pack toggle */}
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-surface/60 p-1">
        {(['pick', 'pack'] as Mode[]).map((m) => {
          const Icon = m === 'pick' ? Package : PackageCheck
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-semibold transition',
                mode === m
                  ? 'bg-brand-grad text-white shadow-glow'
                  : 'text-muted active:text-ink',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {m === 'pick' ? 'Picking' : 'Packing'}
            </button>
          )
        })}
      </div>

      {/* Window toggle */}
      <div className="mb-3 inline-flex w-full rounded-lg bg-surface/60 p-0.5">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setWin(w.key)}
            className={cn(
              'flex-1 rounded-md py-1 text-[11px] font-semibold uppercase tracking-wider transition',
              win === w.key
                ? 'bg-surface-2 text-ink ring-1 ring-line-strong'
                : 'text-muted',
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {/* Body */}
      {!data ? (
        <ul className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <li
              key={i}
              className="h-14 animate-pulse rounded-xl bg-surface/40"
            />
          ))}
        </ul>
      ) : !data.configured ? (
        <p className="rounded-xl bg-surface/60 px-4 py-5 text-center text-[12px] text-muted">
          {win === 'today' ? 'Today' : win === 'week' ? 'WTD' : win === 'ytd' ? 'YTD' : 'MTD'} template isn't
          configured.
          <br />
          Set <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[10px]">
            PVX_PICK_TEMPLATE_{win === 'today' ? 'TODAY' : win === 'week' ? 'WTD' : win === 'ytd' ? 'YTD' : 'MTD'}
          </code>{' '}
          to enable.
        </p>
      ) : ranked.length === 0 ? (
        <p className="rounded-xl bg-surface/60 px-4 py-5 text-center text-[12px] text-muted">
          No {modeLabel} activity {winLabel} yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {ranked.map((r, i) => {
            const v = r[metric.primary] as number
            const pct = Math.max(4, Math.round((v / max) * 100))
            return (
              <Row key={r.picker} row={r} rank={i + 1} pct={pct} v={v} metric={metric} win={win} />
            )
          })}
        </ul>
      )}

      {data?.latest && ranked.length > 0 && (
        <p className="mt-2 text-right text-[10px] text-muted">
          Refreshed {timeAgo(data.latest)}
        </p>
      )}
    </section>
  )
}

function Row({
  row, rank, pct, v, metric, win,
}: {
  row: LeaderboardRow
  rank: number
  pct: number
  v: number
  metric: MetricCfg
  win: LeaderboardWindow
}) {
  const badges = badgesFor(row, rank, win)
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface/60 px-3 py-2.5 active:bg-surface-2">
      <span
        className={cn(
          'grid h-8 w-8 flex-shrink-0 place-items-center rounded-md font-mono text-xs font-bold',
          rank === 1
            ? 'bg-brand-grad text-white shadow-glow'
            : rank === 2
              ? 'bg-good/15 text-good'
              : rank === 3
                ? 'bg-warn/15 text-warn'
                : 'bg-surface-3 text-muted',
        )}
      >
        {rank === 1 ? <Crown className="h-3.5 w-3.5" /> : rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-ink">{row.picker}</span>
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
        <div className="tnum text-xl font-bold text-ink leading-none">
          {fmtN(v)}
        </div>
        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
          {metric.unit}
        </div>
      </div>
    </li>
  )
}
