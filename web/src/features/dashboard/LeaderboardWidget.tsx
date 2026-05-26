import { useEffect, useRef, useState } from 'react'
import { Trophy, Tv } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import {
  fetchLeaderboard,
  type LeaderboardResponse,
  type LeaderboardWindow,
} from '@/lib/api'
import { fmtN, timeAgo } from '@/lib/inventory'

const TABS: { key: LeaderboardWindow; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7d' },
  { key: 'month', label: 'Last 30d' },
]

export function LeaderboardWidget() {
  const navigate = useNavigate()
  const [win, setWin] = useState<LeaderboardWindow>('today')
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

  // Backend missing the endpoint entirely — hide the card so it doesn't clutter
  // the dashboard on older deploys.
  if (unsupported) return null

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
        eyebrow="Picking"
        title="Picker leaderboard"
        action={
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div
              className="inline-flex rounded-lg border border-line bg-surface/40 p-0.5"
              role="tablist"
              aria-label="Leaderboard window"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={win === t.key}
                  onClick={() => setWin(t.key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[11px] font-semibold transition',
                    win === t.key
                      ? 'bg-brand-grad text-white shadow-glow'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {t.label}
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
              TV view
            </button>
          </div>
        }
      />
      <CardBody className="!pt-1">
        {err ? (
          <EmptyState
            title="Couldn't load leaderboard"
            body={err}
            tone="bad"
          />
        ) : !data ? (
          <SkeletonRows />
        ) : !data.configured ? (
          <EmptyState
            title="Pick sync isn't configured"
            body={
              <>
                Set <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">PVX_PICK_TEMPLATE</code>{' '}
                (and matching column env vars) on the server to power this card.
              </>
            }
          />
        ) : data.rows.length === 0 ? (
          <EmptyState
            title={
              data.totalRows === 0
                ? 'No pick activity yet'
                : `No picks in this window`
            }
            body={
              data.totalRows === 0
                ? 'The next PVX sync will populate this card.'
                : data.latest
                  ? `Latest pick on record: ${timeAgo(data.latest)}.`
                  : 'Try a wider window.'
            }
          />
        ) : (
          <LeaderboardList rows={data.rows} latest={data.latest} />
        )}
      </CardBody>
    </Card>
  )
}

function LeaderboardList({
  rows,
  latest,
}: {
  rows: LeaderboardResponse['rows']
  latest: string | null
}) {
  const max = rows[0]?.units || 1
  return (
    <>
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const pct = Math.max(4, Math.round((r.units / max) * 100))
          const rankTone =
            i === 0
              ? 'bg-brand-grad text-white'
              : i === 1
                ? 'bg-good/15 text-good'
                : i === 2
                  ? 'bg-warn/15 text-warn'
                  : 'bg-surface-3 text-muted'
          return (
            <li
              key={r.picker}
              className="flex items-center gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2.5 transition hover:border-brand-ring/40 hover:bg-surface-2"
            >
              <span
                className={cn(
                  'grid h-8 w-8 flex-shrink-0 place-items-center rounded-md font-mono text-xs font-bold',
                  rankTone,
                )}
              >
                {i === 0 ? <Trophy className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">
                  {r.picker}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-brand-grad transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="tnum text-base font-bold text-ink">
                  {fmtN(r.units)}
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    units
                  </span>
                </div>
                <div className="text-[11px] text-muted">
                  {fmtN(r.orders)} orders · {fmtN(r.lines)} lines
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {latest ? (
        <p className="mt-3 text-right text-[11px] text-muted">
          Latest pick: {timeAgo(latest)}
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
