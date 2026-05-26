import { useEffect, useMemo, useState } from 'react'
import { Trophy, Package, PackageCheck, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'

// ─── Data layer ─────────────────────────────────────────────────────────

interface RawRow {
  picker: string
  units: number              // items picked
  lines: number              // picks completed
  orders: number             // orders despatched
  items_skipped: number
  containers_moved: number
  item_movements: number
  items_moved: number
  packages_despatched: number
  items_despatched: number
  snapshot_at: string
}

interface RawResponse {
  rows: RawRow[]
  totalRows: number
  latest: string | null
}

async function fetchRaw(signal?: AbortSignal): Promise<RawResponse | null> {
  const res = await fetch('/api/leaderboard?mode=raw&limit=30', {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`/api/leaderboard ${res.status}`)
  return res.json()
}

// ─── Component ──────────────────────────────────────────────────────────

type Mode = 'picking' | 'packing'
const CYCLE_MS = 12_000
const REFRESH_MS = 30_000

interface BoardConfig {
  mode: Mode
  label: string
  metricKey: 'units' | 'items_despatched'
  metricLabel: string
  unitLabel: string
  accent: string                 // text + bar accent classes
  bg: string                     // background gradient classes
  icon: typeof Trophy
}

const BOARDS: Record<Mode, BoardConfig> = {
  picking: {
    mode: 'picking',
    label: 'Picking',
    metricKey: 'units',
    metricLabel: 'Items picked',
    unitLabel: 'items',
    accent: 'from-cyan-300 via-teal-300 to-emerald-300',
    bg: 'from-[#031826] via-[#072a3e] to-[#0a3a52]',
    icon: Package,
  },
  packing: {
    mode: 'packing',
    label: 'Packing',
    metricKey: 'items_despatched',
    metricLabel: 'Items despatched',
    unitLabel: 'items',
    accent: 'from-amber-300 via-orange-300 to-rose-300',
    bg: 'from-[#1f0c0a] via-[#3a1207] to-[#5a1d0a]',
    icon: PackageCheck,
  },
}

export function LeaderboardTv() {
  const navigate = useNavigate()
  const [data, setData] = useState<RawResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('picking')
  const [tick, setTick] = useState(0) // forces clock re-renders

  // Data fetch loop
  useEffect(() => {
    let cancelled = false
    const load = () => {
      const ctl = new AbortController()
      fetchRaw(ctl.signal)
        .then((r) => {
          if (cancelled) return
          if (r === null) {
            setErr('Leaderboard endpoint unavailable on this deploy.')
            return
          }
          setData(r)
          setErr(null)
        })
        .catch((e: Error) => {
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

  // Mode cycle
  useEffect(() => {
    const id = setInterval(() => {
      setMode((m) => (m === 'picking' ? 'packing' : 'picking'))
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  // Clock tick (every second)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // ESC closes the TV view back to the dashboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  const board = BOARDS[mode]
  const Icon = board.icon

  const rows = useMemo(() => {
    if (!data) return []
    return [...data.rows]
      .sort((a, b) => (b[board.metricKey] as number) - (a[board.metricKey] as number))
      .slice(0, 8)
  }, [data, board.metricKey])

  const activeRows = rows.filter((r) => (r[board.metricKey] as number) > 0)
  const topThree = activeRows.slice(0, 3)
  const rest = activeRows.slice(3)

  const now = new Date(Date.now() + tick * 0)
  const dateStr = now.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 overflow-hidden bg-gradient-to-br text-white',
        'transition-[background] duration-700 ease-in-out',
        board.bg,
      )}
    >
      {/* Ambient glow */}
      <div
        className={cn(
          'pointer-events-none absolute -top-1/3 left-1/2 h-[120vh] w-[120vh] -translate-x-1/2 rounded-full',
          'bg-gradient-to-br opacity-25 blur-3xl transition-all duration-1000',
          board.accent,
        )}
      />
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Close (top-right) */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="absolute right-6 top-6 z-30 grid h-12 w-12 place-items-center rounded-full bg-white/5 text-white/60 backdrop-blur transition hover:bg-white/15 hover:text-white"
        aria-label="Close leaderboard"
        title="Esc"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative z-10 flex h-full flex-col p-10 xl:p-14">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Trophy className="h-7 w-7 text-white/70" />
              <p className="font-mono text-sm uppercase tracking-[0.32em] text-white/70">
                Today's leaderboard
              </p>
            </div>
            <h1 className="mt-2 text-[clamp(2.25rem,3.6vw,4rem)] font-black leading-[1] text-white">
              Ryderwear Warehouse
            </h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-[clamp(2.5rem,4vw,5rem)] font-black leading-none text-white tabular-nums">
              {timeStr}
            </div>
            <p className="mt-1 text-sm uppercase tracking-widest text-white/60">{dateStr}</p>
          </div>
        </header>

        {/* Category banner */}
        <div className="mt-6 flex items-center justify-center xl:mt-8">
          <div
            key={mode /* re-mount on cycle for entry animation */}
            className={cn(
              'relative inline-flex items-center gap-5 rounded-full px-10 py-3.5',
              'bg-white/[0.06] backdrop-blur ring-1 ring-white/15',
              'animate-[fadeUp_550ms_cubic-bezier(0.16,1,0.3,1)]',
            )}
          >
            <Icon className="h-8 w-8 text-white" />
            <span
              className={cn(
                'bg-gradient-to-r bg-clip-text text-[clamp(2.5rem,4.5vw,5rem)] font-black uppercase leading-none tracking-tight text-transparent',
                board.accent,
              )}
            >
              {board.label}
            </span>
            <span className="ml-2 text-sm uppercase tracking-[0.2em] text-white/50">
              by {board.metricLabel}
            </span>
          </div>
        </div>

        {/* Main board */}
        <main className="mt-8 flex flex-1 flex-col gap-8 xl:mt-10">
          {err ? (
            <Centered>
              <p className="text-2xl text-white/70">{err}</p>
            </Centered>
          ) : !data ? (
            <Centered>
              <p className="text-2xl text-white/50">Loading live data…</p>
            </Centered>
          ) : activeRows.length === 0 ? (
            <Centered>
              <Icon className="mb-4 h-16 w-16 text-white/30" />
              <p className="text-3xl font-bold text-white/80">
                No {board.label.toLowerCase()} activity yet today
              </p>
              <p className="mt-2 text-base text-white/40">
                Numbers refresh every 30 seconds
              </p>
            </Centered>
          ) : (
            <>
              {/* Podium */}
              <Podium top={topThree} board={board} key={`podium-${mode}`} />
              {/* Rest */}
              {rest.length > 0 && (
                <ol className="grid grid-cols-1 gap-3 self-stretch xl:grid-cols-2 xl:gap-4">
                  {rest.map((r, i) => (
                    <RestRow
                      key={`${mode}-${r.picker}`}
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

        {/* Footer */}
        <footer className="mt-6 flex items-center justify-between text-sm text-white/50">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="uppercase tracking-widest">
              Live · refreshed {data?.latest ? agoLabel(data.latest) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Dot active={mode === 'picking'} />
            <Dot active={mode === 'packing'} />
            <span className="ml-2 uppercase tracking-widest">Cycling every {CYCLE_MS / 1000}s</span>
          </div>
        </footer>
      </div>

      {/* Component-scoped keyframes */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes podiumRise {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes restSlide {
          from { opacity: 0; transform: translateX(-12px); }
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

function Podium({ top, board }: { top: RawRow[]; board: BoardConfig }) {
  // Render order on screen: #2 (left), #1 (centre), #3 (right). Slot heights
  // emphasise the centre. Fill with placeholders if <3 active pickers.
  const slots = [top[1], top[0], top[2]]
  const heights = ['h-[28vh]', 'h-[36vh]', 'h-[24vh]']
  const ranks = [2, 1, 3]

  return (
    <div className="grid grid-cols-3 items-end gap-6 xl:gap-10">
      {slots.map((row, i) => (
        <PodiumColumn
          key={i}
          row={row}
          rank={ranks[i]}
          height={heights[i]}
          board={board}
          delayMs={i * 120}
        />
      ))}
    </div>
  )
}

function PodiumColumn({
  row,
  rank,
  height,
  board,
  delayMs,
}: {
  row: RawRow | undefined
  rank: number
  height: string
  board: BoardConfig
  delayMs: number
}) {
  const isWinner = rank === 1
  const medalColors: Record<number, string> = {
    1: 'from-amber-300 via-yellow-400 to-amber-500',
    2: 'from-slate-200 via-slate-300 to-slate-400',
    3: 'from-orange-300 via-amber-500 to-amber-700',
  }
  return (
    <div
      className="flex flex-col items-center"
      style={{ animation: `podiumRise 700ms ${delayMs}ms cubic-bezier(0.16,1,0.3,1) both` }}
    >
      {/* Name + score above the column */}
      <div className="mb-4 flex flex-col items-center text-center">
        <span
          className={cn(
            'mb-2 grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br font-black text-black shadow-lg',
            'ring-2 ring-white/30',
            medalColors[rank],
          )}
        >
          {rank}
        </span>
        <p
          className={cn(
            'font-black uppercase leading-tight',
            isWinner
              ? 'text-[clamp(2rem,3.6vw,4rem)] text-white'
              : 'text-[clamp(1.4rem,2.4vw,2.6rem)] text-white/90',
          )}
        >
          {row?.picker ?? '—'}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span
            className={cn(
              'tabular-nums font-black leading-none',
              isWinner
                ? 'bg-gradient-to-r bg-clip-text text-[clamp(3rem,6vw,7rem)] text-transparent'
                : 'text-[clamp(2rem,3.6vw,4rem)] text-white',
              isWinner && board.accent,
            )}
          >
            {row ? formatNum(row[board.metricKey] as number) : '—'}
          </span>
          <span className="text-base font-bold uppercase tracking-wider text-white/60">
            {board.unitLabel}
          </span>
        </div>
      </div>

      {/* The pillar */}
      <div
        className={cn(
          'relative w-full rounded-t-xl shadow-2xl',
          height,
          'bg-gradient-to-b',
          isWinner ? board.accent : 'from-white/25 via-white/15 to-white/5',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-white/40" />
        <div className="absolute inset-x-3 bottom-3 grid h-12 w-[calc(100%-1.5rem)] place-items-center rounded-md bg-black/30 text-2xl font-black text-white/80">
          {rank}
        </div>
      </div>
    </div>
  )
}

function RestRow({ row, rank, board }: { row: RawRow; rank: number; board: BoardConfig }) {
  return (
    <li
      className="flex items-center gap-5 rounded-2xl bg-white/[0.06] px-6 py-4 ring-1 ring-white/10 backdrop-blur"
      style={{
        animation: `restSlide 500ms ${(rank - 4) * 60}ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full bg-white/10 font-mono text-lg font-bold text-white/70">
        {rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white xl:text-3xl">
        {row.picker}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'tabular-nums text-3xl font-black xl:text-4xl',
            'bg-gradient-to-r bg-clip-text text-transparent',
            board.accent,
          )}
        >
          {formatNum(row[board.metricKey] as number)}
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
          {board.unitLabel}
        </span>
      </div>
    </li>
  )
}

function Dot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'h-2 rounded-full transition-all duration-500',
        active ? 'w-8 bg-white' : 'w-2 bg-white/30',
      )}
    />
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatNum(n: number) {
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
