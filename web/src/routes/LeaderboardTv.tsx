import { useEffect, useMemo, useState } from 'react'
import { Trophy, Package, PackageCheck, X, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { fetchLeaderboard, type LeaderboardRow, type LeaderboardWindow } from '@/lib/api'

// ─── Config ─────────────────────────────────────────────────────────────

type Mode = 'pick' | 'pack'

const CYCLE_MS = 12_000
const REFRESH_MS = 30_000

interface BoardConfig {
  mode: Mode
  label: string
  metricKey: keyof LeaderboardRow
  metricLabel: string
  secondaryA: { key: keyof LeaderboardRow; label: string }
  secondaryB: { key: keyof LeaderboardRow; label: string }
  accent: { text: string; bar: string; chip: string; ring: string }
  Icon: typeof Package
}

// Professional palette — restrained accent colours, dark consistent BG.
// Picking → cool teal/cyan. Packing → warm amber.
const BOARDS: Record<Mode, BoardConfig> = {
  pick: {
    mode: 'pick',
    label: 'Picking',
    metricKey: 'items_picked',
    metricLabel: 'Items picked',
    secondaryA: { key: 'picks_completed', label: 'picks' },
    secondaryB: { key: 'items_skipped', label: 'skips' },
    accent: {
      text: 'text-cyan-300',
      bar: 'bg-cyan-400',
      chip: 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-300/30',
      ring: 'ring-cyan-300/40',
    },
    Icon: Package,
  },
  pack: {
    mode: 'pack',
    label: 'Packing',
    metricKey: 'items_despatched',
    metricLabel: 'Items despatched',
    secondaryA: { key: 'packages_despatched', label: 'pkgs' },
    secondaryB: { key: 'orders_despatched', label: 'orders' },
    accent: {
      text: 'text-amber-300',
      bar: 'bg-amber-400',
      chip: 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30',
      ring: 'ring-amber-300/40',
    },
    Icon: PackageCheck,
  },
}

const WINDOWS: { key: LeaderboardWindow; label: string; sub: string }[] = [
  { key: 'today', label: 'Today',         sub: 'Live · since midnight' },
  { key: 'week',  label: 'Week to date',  sub: 'Monday → now' },
  { key: 'month', label: 'Month to date', sub: 'This month' },
]

// ─── Component ──────────────────────────────────────────────────────────

export function LeaderboardTv() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('pick')
  const [win, setWin] = useState<LeaderboardWindow>('today')
  const [data, setData] = useState<{
    today: LeaderboardRow[] | null
    week: LeaderboardRow[] | null
    month: LeaderboardRow[] | null
    today_configured: boolean
    week_configured: boolean
    month_configured: boolean
    latest: string | null
  }>({
    today: null, week: null, month: null,
    today_configured: false, week_configured: false, month_configured: false,
    latest: null,
  })
  const [err, setErr] = useState<string | null>(null)
  const [, setTick] = useState(0) // forces clock re-renders every second

  // Fetch all three windows in parallel, refresh every 30s
  useEffect(() => {
    let cancelled = false
    const load = () => {
      const ctl = new AbortController()
      Promise.all([
        fetchLeaderboard('today', ctl.signal).catch(() => null),
        fetchLeaderboard('week', ctl.signal).catch(() => null),
        fetchLeaderboard('month', ctl.signal).catch(() => null),
      ]).then(([t, w, m]) => {
        if (cancelled) return
        const latest = [t, w, m]
          .map((r) => r?.latest)
          .filter(Boolean)
          .sort()
          .pop() as string | undefined
        setData({
          today: t?.rows ?? null,
          week: w?.rows ?? null,
          month: m?.rows ?? null,
          today_configured: t?.configured ?? false,
          week_configured: w?.configured ?? false,
          month_configured: m?.configured ?? false,
          latest: latest ?? null,
        })
        setErr(null)
      }).catch((e: Error) => {
        if (cancelled || e.name === 'AbortError') return
        setErr(e.message)
      })
      return ctl
    }
    let ctl = load()
    const id = setInterval(() => {
      ctl.abort()
      ctl = load()
    }, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      ctl.abort()
    }
  }, [])

  // Auto-cycle mode (pick ↔ pack)
  useEffect(() => {
    const id = setInterval(() => {
      setMode((m) => (m === 'pick' ? 'pack' : 'pick'))
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // Esc → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/')
      if (e.key === '1') setWin('today')
      if (e.key === '2') setWin('week')
      if (e.key === '3') setWin('month')
      if (e.key === 'p' || e.key === 'P') setMode('pick')
      if (e.key === 'k' || e.key === 'K') setMode('pack')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const board = BOARDS[mode]
  const windowMeta = WINDOWS.find((w) => w.key === win)!
  const winConfigured = data[`${win}_configured` as const]
  const rowsForWindow = data[win]

  const ranked = useMemo(() => {
    if (!rowsForWindow) return []
    return [...rowsForWindow]
      .filter((r) => (r[board.metricKey] as number) > 0)
      .sort((a, b) => (b[board.metricKey] as number) - (a[board.metricKey] as number))
  }, [rowsForWindow, board.metricKey])

  const topThree = ranked.slice(0, 3)
  const rest = ranked.slice(3, 11)

  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dateStr = now.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#070a13] text-white">
      {/* Subtle radial vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(255,255,255,0.06), transparent 55%), radial-gradient(ellipse at bottom, rgba(0,0,0,0.45), transparent 60%)',
        }}
      />
      {/* Faint grid texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '72px 72px',
        }}
      />

      {/* Close */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="absolute right-6 top-6 z-30 grid h-11 w-11 place-items-center rounded-full bg-white/[0.04] text-white/50 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 hover:text-white"
        aria-label="Close"
        title="Esc"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative z-10 flex h-full flex-col p-8 xl:p-12">
        {/* ── Header ─────────────────────────────────────────────── */}
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-5">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
              <Trophy className="h-7 w-7 text-white/70" />
            </div>
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.32em] text-white/40">
                Ryderwear Warehouse
              </p>
              <h1 className="mt-0.5 text-[clamp(1.6rem,2.4vw,2.6rem)] font-bold leading-tight text-white">
                Operations Leaderboard
              </h1>
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[clamp(2.5rem,4vw,4.5rem)] font-bold leading-none text-white tabular-nums tracking-tight">
              {timeStr}
            </div>
            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">{dateStr}</p>
          </div>
        </header>

        {/* ── Toolbar row: mode + windows ───────────────────────── */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          {/* Big category title */}
          <div className="flex items-baseline gap-4">
            <board.Icon className={cn('h-10 w-10', board.accent.text)} />
            <h2
              key={mode}
              className={cn(
                'text-[clamp(3rem,5vw,5.5rem)] font-black uppercase leading-none tracking-tight',
                board.accent.text,
                'animate-[fadeUp_500ms_cubic-bezier(0.16,1,0.3,1)]',
              )}
            >
              {board.label}
            </h2>
            <span className="ml-2 self-end pb-2 text-base uppercase tracking-[0.25em] text-white/40">
              by {board.metricLabel}
            </span>
          </div>

          {/* Window switcher */}
          <div className="inline-flex rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWin(w.key)}
                className={cn(
                  'rounded-lg px-5 py-2 text-sm font-bold uppercase tracking-wider transition',
                  win === w.key
                    ? 'bg-white text-black shadow-lg'
                    : 'text-white/60 hover:text-white',
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Window sub-label */}
        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-white/40">
          {windowMeta.sub}
        </p>

        {/* ── Main board ────────────────────────────────────────── */}
        <main className="mt-6 flex flex-1 flex-col gap-6">
          {err ? (
            <Centered>
              <p className="text-2xl text-white/70">{err}</p>
            </Centered>
          ) : rowsForWindow === null ? (
            <Centered>
              <p className="text-2xl text-white/40">Loading…</p>
            </Centered>
          ) : !winConfigured ? (
            <Centered>
              <board.Icon className="mb-4 h-14 w-14 text-white/20" />
              <p className="text-2xl font-semibold text-white/80">
                {windowMeta.label} template isn't configured
              </p>
              <p className="mt-2 max-w-xl text-sm uppercase tracking-wider text-white/40">
                Set PVX_PICK_TEMPLATE_{win === 'today' ? 'TODAY' : win === 'week' ? 'WTD' : 'MTD'} on the server.
              </p>
            </Centered>
          ) : ranked.length === 0 ? (
            <Centered>
              <board.Icon className="mb-4 h-14 w-14 text-white/20" />
              <p className="text-2xl font-semibold text-white/80">
                No {board.label.toLowerCase()} activity {win === 'today' ? 'yet today' : win === 'week' ? 'this week' : 'this month'}
              </p>
              <p className="mt-2 text-sm uppercase tracking-wider text-white/40">
                Refreshing every {REFRESH_MS / 1000}s
              </p>
            </Centered>
          ) : (
            <>
              <Podium top={topThree} board={board} key={`${mode}-${win}-podium`} />
              {rest.length > 0 && (
                <ol className="grid grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
                  {rest.map((r, i) => (
                    <RestRow
                      key={`${mode}-${win}-${r.picker}`}
                      row={r}
                      rank={i + 4}
                      board={board}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </main>

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="mt-6 flex items-center justify-between border-t border-white/10 pt-5 text-[11px] uppercase tracking-[0.2em] text-white/50">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>
              Live · refreshed {data.latest ? agoLabel(data.latest) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Dot active={mode === 'pick'} accent={BOARDS.pick.accent.bar} />
            <Dot active={mode === 'pack'} accent={BOARDS.pack.accent.bar} />
            <span className="ml-2">Cycles every {CYCLE_MS / 1000}s</span>
          </div>
        </footer>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes podiumRise {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes restSlide {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">{children}</div>
  )
}

function Podium({ top, board }: { top: LeaderboardRow[]; board: BoardConfig }) {
  // Render order: #2 (left), #1 (centre), #3 (right). Tallest in the middle.
  const slots = [
    { row: top[1], rank: 2, h: 'h-[24vh]' },
    { row: top[0], rank: 1, h: 'h-[32vh]' },
    { row: top[2], rank: 3, h: 'h-[20vh]' },
  ]
  return (
    <div className="grid grid-cols-3 items-end gap-6 xl:gap-10">
      {slots.map((s, i) => (
        <PodiumColumn
          key={i}
          row={s.row}
          rank={s.rank}
          height={s.h}
          board={board}
          delayMs={i === 1 ? 0 : i === 0 ? 140 : 280}
        />
      ))}
    </div>
  )
}

function PodiumColumn({
  row, rank, height, board, delayMs,
}: {
  row: LeaderboardRow | undefined
  rank: number
  height: string
  board: BoardConfig
  delayMs: number
}) {
  const isWinner = rank === 1
  // Three matte medal tones — gold / silver / bronze, plus a flat tone
  // for empty placeholders. Solid colors, no flashy gradients.
  const medal: Record<number, string> = {
    1: 'bg-amber-400 text-black',
    2: 'bg-slate-300 text-black',
    3: 'bg-amber-700 text-white',
  }
  return (
    <div
      className="flex flex-col items-center"
      style={{ animation: `podiumRise 600ms ${delayMs}ms cubic-bezier(0.16,1,0.3,1) both` }}
    >
      <div className="mb-4 flex flex-col items-center text-center">
        {row ? (
          <>
            <span
              className={cn(
                'mb-3 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black uppercase tracking-wider shadow-lg',
                medal[rank],
              )}
            >
              {isWinner ? <Crown className="h-4 w-4" /> : null}
              #{rank}
            </span>
            <p
              className={cn(
                'font-bold uppercase leading-tight text-white',
                isWinner
                  ? 'text-[clamp(1.8rem,3vw,3rem)]'
                  : 'text-[clamp(1.2rem,2vw,2rem)] text-white/90',
              )}
            >
              {row.picker}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  'tabular-nums font-black leading-none tracking-tight',
                  isWinner
                    ? cn('text-[clamp(3rem,5.5vw,6rem)]', board.accent.text)
                    : 'text-[clamp(2rem,3.6vw,3.6rem)] text-white',
                )}
              >
                {fmtN(row[board.metricKey] as number)}
              </span>
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-white/50">
              {fmtN(row[board.secondaryA.key] as number)} {board.secondaryA.label} ·{' '}
              {fmtN(row[board.secondaryB.key] as number)} {board.secondaryB.label}
            </div>
          </>
        ) : (
          <>
            <span className="mb-3 inline-flex h-11 items-center rounded-full bg-white/5 px-4 text-sm font-bold uppercase tracking-wider text-white/30">
              #{rank}
            </span>
            <p className="text-[clamp(1.2rem,2vw,2rem)] font-bold text-white/30">—</p>
            <p className="mt-2 text-[clamp(2rem,3vw,3rem)] font-black text-white/20">—</p>
          </>
        )}
      </div>

      {/* Column */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-t-lg ring-1 ring-white/10',
          height,
          isWinner ? 'bg-gradient-to-b from-white/15 via-white/10 to-white/5' : 'bg-white/[0.05]',
        )}
      >
        {isWinner ? (
          <div className={cn('absolute inset-x-0 top-0 h-[3px]', board.accent.bar)} />
        ) : (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-white/30" />
        )}
        <div className="absolute inset-x-4 bottom-4 grid h-12 place-items-center rounded-md bg-black/40 text-2xl font-black text-white/60 ring-1 ring-white/5">
          {rank}
        </div>
      </div>
    </div>
  )
}

function RestRow({
  row, rank, board,
}: {
  row: LeaderboardRow
  rank: number
  board: BoardConfig
}) {
  return (
    <li
      className="flex items-center gap-5 rounded-lg bg-white/[0.04] px-5 py-3 ring-1 ring-white/10"
      style={{
        animation: `restSlide 450ms ${(rank - 4) * 60}ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-md bg-white/5 font-mono text-base font-bold text-white/60">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xl font-bold text-white xl:text-2xl">{row.picker}</div>
        <div className="mt-0.5 text-xs uppercase tracking-wider text-white/40">
          {fmtN(row[board.secondaryA.key] as number)} {board.secondaryA.label} ·{' '}
          {fmtN(row[board.secondaryB.key] as number)} {board.secondaryB.label}
        </div>
      </div>
      <div className="text-right">
        <span
          className={cn(
            'tabular-nums text-3xl font-black xl:text-4xl tracking-tight',
            board.accent.text,
          )}
        >
          {fmtN(row[board.metricKey] as number)}
        </span>
      </div>
    </li>
  )
}

function Dot({ active, accent }: { active: boolean; accent: string }) {
  return (
    <span
      className={cn(
        'h-1.5 rounded-full transition-all duration-500',
        active ? cn('w-8', accent) : 'w-2 bg-white/20',
      )}
    />
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function fmtN(n: number) {
  return Number(n || 0).toLocaleString()
}

function agoLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff) || diff < 0) return 'just now'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ago`
}
