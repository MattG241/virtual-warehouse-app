import { useEffect, useMemo, useState } from 'react'
import { Trophy, Package, PackageCheck, X, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { fetchLeaderboard, type LeaderboardRow, type LeaderboardWindow } from '@/lib/api'
import { useTheme } from '@/store/theme'

// ─── Config ─────────────────────────────────────────────────────────────

type Mode = 'pick' | 'pack'

const CYCLE_MS = 12_000
const REFRESH_MS = 30_000

interface BoardConfig {
  mode: Mode
  label: string
  metricKey: keyof LeaderboardRow
  metricLabel: string
  /** Category accent colour (cyan for pick, amber for pack) per theme */
  accent: { dark: string; light: string }
  /** Bar colour shown on cycle indicator dots */
  bar: string
  /** Ambient radial-glow rgba for the body background */
  glow: { dark: string; light: string }
  Icon: typeof Package
}

const BOARDS: Record<Mode, BoardConfig> = {
  pick: {
    mode: 'pick',
    label: 'Picking',
    metricKey: 'items_picked',
    metricLabel: 'Items picked',
    accent: { dark: 'text-cyan-300', light: 'text-cyan-700' },
    bar: 'bg-cyan-400',
    glow: {
      dark: 'rgba(34, 211, 238, 0.18)',
      light: 'rgba(8, 145, 178, 0.10)',
    },
    Icon: Package,
  },
  pack: {
    mode: 'pack',
    label: 'Packing',
    metricKey: 'items_despatched',
    metricLabel: 'Items packed',
    accent: { dark: 'text-amber-300', light: 'text-amber-700' },
    bar: 'bg-amber-400',
    glow: {
      dark: 'rgba(251, 191, 36, 0.18)',
      light: 'rgba(217, 119, 6, 0.10)',
    },
    Icon: PackageCheck,
  },
}

const WINDOWS: { key: LeaderboardWindow; label: string; sub: string }[] = [
  { key: 'today', label: 'Today',         sub: 'Live · since midnight' },
  { key: 'week',  label: 'Week to date',  sub: 'Monday → now' },
  { key: 'month', label: 'Month to date', sub: 'This month' },
]

// Metallic gradients for podium pillars + score text. Each metal has a
// fully-saturated "edge" pair and a hot highlight near 50% that the
// shimmer animation slides through.
const METAL = {
  gold: `linear-gradient(110deg,
    #92400e 0%,   #d97706 18%,  #fbbf24 38%,
    #fef3c7 48%,  #ffffff 50%,  #fef3c7 52%,
    #fbbf24 62%,  #d97706 82%,  #92400e 100%)`,
  silver: `linear-gradient(110deg,
    #475569 0%,   #94a3b8 18%,  #cbd5e1 38%,
    #f1f5f9 48%,  #ffffff 50%,  #f1f5f9 52%,
    #cbd5e1 62%,  #94a3b8 82%,  #475569 100%)`,
  bronze: `linear-gradient(110deg,
    #431407 0%,   #78350f 18%,  #b45309 38%,
    #d97706 48%,  #fbbf24 50%,  #d97706 52%,
    #b45309 62%,  #78350f 82%,  #431407 100%)`,
}

const METAL_BY_RANK: Record<number, string> = {
  1: METAL.gold,
  2: METAL.silver,
  3: METAL.bronze,
}

// Gold-glitter image (lives in web/public/). Used for #1 pillar +
// mobile #1 hero — gives a real photographed sparkle base; the
// animated shimmer gradient slides over the top.
const GOLD_GLITTER_URL = '/gold-glitter.jpg'

/** Background-image stack: animated white sheen on top, glitter image
 *  underneath. The first layer's position is what `metal-shimmer-image`
 *  animates, so the glitter stays still while the sheen sweeps across. */
const GOLD_GLITTER_BG: React.CSSProperties = {
  backgroundImage: `
    linear-gradient(110deg, transparent 38%, rgba(255,255,255,0.55) 50%, transparent 62%),
    url(${GOLD_GLITTER_URL})
  `,
  backgroundSize: '250% 100%, cover',
  backgroundPosition: '-150% 0, center',
  backgroundRepeat: 'no-repeat, no-repeat',
}

// ─── Component ──────────────────────────────────────────────────────────

export function LeaderboardTv() {
  const navigate = useNavigate()
  const themeMode = useTheme((s) => s.mode)
  const isLight = themeMode === 'light'
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
  const [, setTick] = useState(0)

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
    const id = setInterval(() => { ctl.abort(); ctl = load() }, REFRESH_MS)
    return () => { cancelled = true; clearInterval(id); ctl.abort() }
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setMode((m) => (m === 'pick' ? 'pack' : 'pick'))
    }, CYCLE_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

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
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })

  // Theme-aware tokens — defined once so the JSX stays readable
  const t = {
    bg:           isLight ? 'bg-[#f4f6fa]' : 'bg-[#070a13]',
    text:         isLight ? 'text-slate-900' : 'text-white',
    textMuted:    isLight ? 'text-slate-500' : 'text-white/50',
    textSubtle:   isLight ? 'text-slate-400' : 'text-white/40',
    border:       isLight ? 'border-slate-200' : 'border-white/10',
    cardBg:       isLight ? 'bg-white/70' : 'bg-white/[0.04]',
    cardRing:     isLight ? 'ring-slate-200/70' : 'ring-white/10',
    chipBg:       isLight ? 'bg-slate-100' : 'bg-white/[0.04]',
    iconBg:       isLight ? 'bg-slate-100' : 'bg-white/[0.06]',
    iconRing:     isLight ? 'ring-slate-200' : 'ring-white/10',
    pillActive:   isLight ? 'bg-slate-900 text-white' : 'bg-white text-black',
    pillIdle:     isLight ? 'text-slate-500 hover:text-slate-900' : 'text-white/60 hover:text-white',
    closeBg:      isLight ? 'bg-white text-slate-500 ring-slate-200' : 'bg-white/[0.04] text-white/50 ring-white/10',
    closeHover:   isLight ? 'hover:bg-slate-100 hover:text-slate-900' : 'hover:bg-white/10 hover:text-white',
    metricLabel:  isLight ? 'text-slate-500' : 'text-white/40',
  }

  return (
    <div className={cn('fixed inset-0 z-50 overflow-y-auto overflow-x-hidden transition-colors duration-500', t.bg, t.text)}>
      {/* Soft ambient spotlight in the active board's accent colour */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: isLight
            ? `radial-gradient(ellipse 80% 50% at 50% -5%, ${board.glow.light}, transparent 70%)`
            : `radial-gradient(ellipse 80% 50% at 50% -5%, ${board.glow.dark}, transparent 70%), radial-gradient(ellipse 60% 40% at 50% 110%, rgba(0,0,0,0.4), transparent 70%)`,
        }}
      />

      {/* Close */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className={cn(
          'fixed right-3 top-3 z-30 grid h-9 w-9 place-items-center rounded-full ring-1 backdrop-blur transition sm:right-6 sm:top-6 sm:h-11 sm:w-11',
          t.closeBg, t.closeHover,
        )}
        aria-label="Close"
        title="Esc"
      >
        <X className="h-4 w-4 sm:h-5 sm:w-5" />
      </button>

      <div className="relative z-10 flex h-full flex-col p-4 sm:p-6 xl:p-12">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className={cn('flex flex-col gap-4 border-b pb-4 sm:pb-6 md:flex-row md:items-center md:justify-between', t.border)}>
          <div className="flex items-center gap-3 sm:gap-5">
            <div className={cn('grid h-10 w-10 place-items-center rounded-xl ring-1 sm:h-14 sm:w-14', t.iconBg, t.iconRing)}>
              <Trophy className={cn('h-5 w-5 sm:h-7 sm:w-7', t.textMuted)} />
            </div>
            <div className="min-w-0">
              <p className={cn('font-mono text-[10px] uppercase tracking-[0.24em] sm:text-[11px] sm:tracking-[0.32em]', t.textSubtle)}>
                Ryderwear Warehouse
              </p>
              <h1 className="mt-0.5 text-[clamp(1.1rem,4.5vw,2.6rem)] font-bold leading-tight">
                Operations Leaderboard
              </h1>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3 md:flex-col md:items-end md:text-right">
            <div className="font-mono text-[clamp(2rem,9vw,4.5rem)] font-bold leading-none tabular-nums tracking-tight">
              {timeStr}
            </div>
            <p className={cn('text-[10px] uppercase tracking-[0.2em] sm:text-xs', t.textMuted)}>
              {dateStr}
            </p>
          </div>
        </header>

        {/* ── Toolbar: category + window switcher ─────────────────── */}
        <div className="mt-4 flex flex-col gap-3 sm:mt-6 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <div className="flex items-baseline gap-2 sm:gap-4">
            <board.Icon
              className={cn('h-6 w-6 sm:h-10 sm:w-10', isLight ? board.accent.light : board.accent.dark)}
            />
            <h2
              key={mode}
              className={cn(
                'text-[clamp(1.8rem,8vw,5.5rem)] font-black uppercase leading-none tracking-tight',
                isLight ? board.accent.light : board.accent.dark,
                'animate-[fadeUp_500ms_cubic-bezier(0.16,1,0.3,1)]',
              )}
            >
              {board.label}
            </h2>
            <span className={cn('hidden self-end pb-1 text-[10px] uppercase tracking-[0.25em] sm:inline sm:pb-2 sm:text-base', t.textSubtle)}>
              by {board.metricLabel}
            </span>
          </div>

          <div className={cn('inline-flex w-full rounded-xl p-1 ring-1 md:w-auto', t.chipBg, t.cardRing)}>
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWin(w.key)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wider transition sm:px-5 sm:text-sm md:flex-initial',
                  win === w.key ? t.pillActive + ' shadow-lg' : t.pillIdle,
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        <p className={cn('mt-2 text-[10px] uppercase tracking-[0.2em] sm:text-sm', t.textSubtle)}>
          {windowMeta.sub}
        </p>

        {/* ── Main ─────────────────────────────────────────────────── */}
        <main className="mt-6 flex flex-1 flex-col gap-6">
          {err ? (
            <Centered>
              <p className={cn('text-2xl', t.textMuted)}>{err}</p>
            </Centered>
          ) : rowsForWindow === null ? (
            <Centered>
              <p className={cn('text-2xl', t.textSubtle)}>Loading…</p>
            </Centered>
          ) : !winConfigured ? (
            <Centered>
              <board.Icon className={cn('mb-4 h-14 w-14', t.textSubtle)} />
              <p className={cn('text-2xl font-semibold', t.textMuted)}>
                {windowMeta.label} template isn't configured
              </p>
              <p className={cn('mt-2 max-w-xl text-sm uppercase tracking-wider', t.textSubtle)}>
                Set PVX_PICK_TEMPLATE_{win === 'today' ? 'TODAY' : win === 'week' ? 'WTD' : 'MTD'} on the server.
              </p>
            </Centered>
          ) : ranked.length === 0 ? (
            <Centered>
              <board.Icon className={cn('mb-4 h-14 w-14', t.textSubtle)} />
              <p className={cn('text-2xl font-semibold', t.textMuted)}>
                No {board.label.toLowerCase()} activity {win === 'today' ? 'yet today' : win === 'week' ? 'this week' : 'this month'}
              </p>
              <p className={cn('mt-2 text-sm uppercase tracking-wider', t.textSubtle)}>
                Refreshing every {REFRESH_MS / 1000}s
              </p>
            </Centered>
          ) : (
            <>
              <Podium top={topThree} board={board} isLight={isLight} key={`${mode}-${win}-podium`} />
              {rest.length > 0 && (
                <ol className="grid grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
                  {rest.map((r, i) => (
                    <RestRow
                      key={`${mode}-${win}-${r.picker}`}
                      row={r}
                      rank={i + 4}
                      board={board}
                      isLight={isLight}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </main>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className={cn('mt-4 flex flex-col items-start gap-3 border-t pt-4 text-[10px] uppercase tracking-[0.2em] sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:pt-5 sm:text-[11px]', t.border, t.textMuted)}>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span>Live · refreshed {data.latest ? agoLabel(data.latest) : '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <Dot active={mode === 'pick'} accent={BOARDS.pick.bar} />
            <Dot active={mode === 'pack'} accent={BOARDS.pack.bar} />
            <span className="ml-2 hidden sm:inline">Cycles every {CYCLE_MS / 1000}s</span>
            <span className="ml-2 sm:hidden">{CYCLE_MS / 1000}s cycle</span>
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
        @keyframes metalShimmer {
          0%   { background-position: -150% 0; }
          100% { background-position: 250% 0; }
        }
        @keyframes goldGlow {
          0%, 100% { box-shadow: 0 0 24px -4px rgba(251, 191, 36, 0.45), 0 0 80px -20px rgba(251, 191, 36, 0.35); }
          50%      { box-shadow: 0 0 40px -2px rgba(251, 191, 36, 0.65), 0 0 120px -10px rgba(251, 191, 36, 0.5); }
        }
        .metal-shimmer {
          background-size: 250% 100%;
          animation: metalShimmer var(--shimmer-duration, 4.5s) linear infinite;
        }
        /* Image-backed gold — animates only the first (sheen) layer's
           background-position. The glitter photo underneath stays put. */
        @keyframes metalShimmerImage {
          0%   { background-position: -150% 0, center; }
          100% { background-position: 250% 0,  center; }
        }
        .metal-shimmer-image {
          animation: metalShimmerImage var(--shimmer-duration, 3.5s) linear infinite;
        }
        .metal-text {
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
          background-size: 250% 100%;
        }
        .metal-text-shimmer {
          animation: metalShimmer 5s linear infinite;
        }
        .gold-glow {
          animation: goldGlow 3.2s ease-in-out infinite;
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

function Podium({
  top, board, isLight,
}: {
  top: LeaderboardRow[]
  board: BoardConfig
  isLight: boolean
}) {
  return (
    <>
      {/* Mobile / small screens — stacked */}
      <div className="flex flex-col gap-3 md:hidden">
        <MobilePodiumHero row={top[0]} board={board} isLight={isLight} />
        {(top[1] || top[2]) && (
          <div className="grid grid-cols-2 gap-3">
            <MobilePodiumCard row={top[1]} rank={2} board={board} isLight={isLight} delayMs={140} />
            <MobilePodiumCard row={top[2]} rank={3} board={board} isLight={isLight} delayMs={220} />
          </div>
        )}
      </div>

      {/* Desktop / TV — classic 3-pillar podium */}
      <div className="hidden grid-cols-3 items-end gap-6 md:grid xl:gap-10">
        <PodiumColumn row={top[1]} rank={2} height="h-[24vh]" board={board} isLight={isLight} delayMs={140} />
        <PodiumColumn row={top[0]} rank={1} height="h-[32vh]" board={board} isLight={isLight} delayMs={0} />
        <PodiumColumn row={top[2]} rank={3} height="h-[20vh]" board={board} isLight={isLight} delayMs={280} />
      </div>
    </>
  )
}

function PodiumColumn({
  row, rank, height, board, isLight, delayMs,
}: {
  row: LeaderboardRow | undefined
  rank: number
  height: string
  board: BoardConfig
  isLight: boolean
  delayMs: number
}) {
  const isWinner = rank === 1
  const metalGradient = METAL_BY_RANK[rank]

  return (
    <div
      className="flex flex-col items-center"
      style={{ animation: `podiumRise 600ms ${delayMs}ms cubic-bezier(0.16,1,0.3,1) both` }}
    >
      {/* Labels above the pillar */}
      <div className="mb-4 flex flex-col items-center text-center">
        {row ? (
          <>
            <MedalChip rank={rank} />
            <p
              className={cn(
                'font-bold uppercase leading-tight',
                isLight ? 'text-slate-900' : 'text-white',
                isWinner ? 'text-[clamp(1.8rem,3vw,3rem)]' : 'text-[clamp(1.2rem,2vw,2rem)]',
              )}
            >
              {row.picker}
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              {/* Big score — metallic gradient text, shimmer on gold */}
              <span
                className={cn(
                  'tabular-nums font-black leading-none tracking-tight metal-text',
                  isWinner ? 'metal-text-shimmer text-[clamp(3rem,5.5vw,6rem)]' : 'text-[clamp(2rem,3.6vw,3.6rem)]',
                )}
                style={{ backgroundImage: metalGradient }}
              >
                {fmtN(row[board.metricKey] as number)}
              </span>
            </div>
            <div
              className={cn(
                'mt-1 text-xs uppercase tracking-[0.2em]',
                isLight ? 'text-slate-500' : 'text-white/40',
              )}
            >
              {board.metricLabel}
            </div>
          </>
        ) : (
          <>
            <span className={cn('mb-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-bold uppercase tracking-wider',
              isLight ? 'bg-slate-100 text-slate-400' : 'bg-white/5 text-white/30')}>
              #{rank}
            </span>
            <p className={cn('text-[clamp(1.2rem,2vw,2rem)] font-bold', isLight ? 'text-slate-300' : 'text-white/30')}>—</p>
            <p className={cn('mt-2 text-[clamp(2rem,3vw,3rem)] font-black', isLight ? 'text-slate-200' : 'text-white/20')}>—</p>
          </>
        )}
      </div>

      {/* The metallic pillar */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-t-lg ring-1',
          height,
          isLight ? 'ring-slate-200' : 'ring-white/10',
          row && isWinner ? 'metal-shimmer-image gold-glow' : '',
          row && !isWinner ? 'metal-shimmer' : '',
        )}
        style={
          row
            ? isWinner
              ? {
                  ...GOLD_GLITTER_BG,
                  ['--shimmer-duration' as string]: '3.5s',
                }
              : {
                  backgroundImage: metalGradient,
                  ['--shimmer-duration' as string]: rank === 2 ? '5s' : '6.5s',
                }
            : { background: isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)' }
        }
      >
        {/* Top edge highlight */}
        <div className={cn('absolute inset-x-0 top-0 h-[3px]', row ? 'bg-white/60' : 'bg-white/15')} />

        {/* Big rank numeral burnished into the pillar. mix-blend-multiply
            darkens the gold/silver/bronze underneath so the numeral reads
            as engraved metal rather than flat dark text fighting the
            glitter texture. The white text-shadow gives an embossed top
            edge. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'select-none font-black leading-none tracking-tighter',
              isWinner ? 'text-[16vh]' : rank === 2 ? 'text-[12vh]' : 'text-[10vh]',
            )}
            style={{
              color: 'rgba(0,0,0,0.65)',
              mixBlendMode: 'multiply',
              textShadow:
                '0 3px 0 rgba(255,255,255,0.45), 0 -1px 0 rgba(255,255,255,0.25)',
            }}
          >
            {rank}
          </span>
        </div>
      </div>
    </div>
  )
}

function MobilePodiumHero({
  row, board, isLight,
}: { row: LeaderboardRow | undefined; board: BoardConfig; isLight: boolean }) {
  if (!row) {
    return (
      <div className={cn('rounded-2xl p-5 text-center ring-1',
        isLight ? 'bg-slate-100 ring-slate-200' : 'bg-white/[0.04] ring-white/10')}>
        <p className={cn('text-base font-bold', isLight ? 'text-slate-400' : 'text-white/40')}>No #1 yet</p>
      </div>
    )
  }
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-5 ring-1 metal-shimmer-image gold-glow',
        isLight ? 'ring-amber-300/50' : 'ring-amber-300/30',
      )}
      style={{
        ...GOLD_GLITTER_BG,
        ['--shimmer-duration' as string]: '3.5s',
        animation: 'podiumRise 600ms cubic-bezier(0.16,1,0.3,1) both',
      }}
    >
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-black/80 px-3 text-xs font-black uppercase tracking-wider text-amber-300 shadow-lg ring-1 ring-amber-300/60">
          <Crown className="h-3.5 w-3.5" />
          #1
        </span>
        <div className="text-right">
          <div className="tabular-nums text-[clamp(2.4rem,11vw,4rem)] font-black leading-none tracking-tight text-black/90 drop-shadow-[0_2px_0_rgba(255,255,255,0.5)]">
            {fmtN(row[board.metricKey] as number)}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-black/70">
            {board.metricLabel}
          </div>
        </div>
      </div>
      <p className="relative z-10 mt-4 text-[clamp(1.4rem,5.5vw,2rem)] font-black uppercase leading-tight text-black/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
        {row.picker}
      </p>
    </div>
  )
}

function MobilePodiumCard({
  row, rank, board, isLight, delayMs,
}: {
  row: LeaderboardRow | undefined
  rank: number
  board: BoardConfig
  isLight: boolean
  delayMs: number
}) {
  const metalGradient = METAL_BY_RANK[rank]
  const textColor = rank === 3 ? 'text-amber-50' : 'text-slate-900'
  const subText = rank === 3 ? 'text-amber-200/80' : 'text-slate-700/80'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-3.5 ring-1 metal-shimmer',
        isLight ? 'ring-slate-300/60' : 'ring-white/10',
      )}
      style={{
        backgroundImage: row ? metalGradient : (isLight ? '#e2e8f0' : 'rgba(255,255,255,0.05)'),
        ['--shimmer-duration' as string]: rank === 2 ? '5s' : '6.5s',
        animation: `podiumRise 600ms ${delayMs}ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      <div className="relative z-10 flex items-center justify-between">
        <span className={cn(
          'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-black uppercase tracking-wider',
          row ? 'bg-black/70 text-white ring-1 ring-white/20' : 'bg-white/10 text-white/30',
        )}>
          #{rank}
        </span>
        <span className={cn(
          'tabular-nums text-2xl font-black leading-none tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.3)]',
          row ? textColor : 'text-white/30',
        )}>
          {row ? fmtN(row[board.metricKey] as number) : '—'}
        </span>
      </div>
      <p className={cn(
        'relative z-10 mt-2 truncate text-base font-black uppercase leading-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]',
        row ? textColor : 'text-white/40',
      )}>
        {row?.picker ?? '—'}
      </p>
      {row && (
        <div className={cn('relative z-10 mt-0.5 text-[10px] font-bold uppercase tracking-wider', subText)}>
          {board.metricLabel}
        </div>
      )}
    </div>
  )
}

function MedalChip({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span
        className="mb-3 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-black uppercase tracking-wider text-black shadow-lg metal-shimmer"
        style={{ backgroundImage: METAL.gold, ['--shimmer-duration' as string]: '3.5s' }}
      >
        <Crown className="h-4 w-4" />
        #1
      </span>
    )
  }
  if (rank === 2) {
    return (
      <span
        className="mb-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-black uppercase tracking-wider text-black shadow-lg metal-shimmer"
        style={{ backgroundImage: METAL.silver, ['--shimmer-duration' as string]: '5s' }}
      >
        #2
      </span>
    )
  }
  return (
    <span
      className="mb-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-black uppercase tracking-wider text-amber-50 shadow-lg metal-shimmer"
      style={{ backgroundImage: METAL.bronze, ['--shimmer-duration' as string]: '6.5s' }}
    >
      #3
    </span>
  )
}

function RestRow({
  row, rank, board, isLight,
}: {
  row: LeaderboardRow
  rank: number
  board: BoardConfig
  isLight: boolean
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2.5 ring-1 sm:gap-5 sm:px-5 sm:py-3 transition-colors',
        isLight ? 'bg-white/80 ring-slate-200' : 'bg-white/[0.04] ring-white/10',
      )}
      style={{
        animation: `restSlide 450ms ${(rank - 4) * 60}ms cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      <span
        className={cn(
          'grid h-8 w-8 flex-shrink-0 place-items-center rounded-md font-mono text-sm font-bold sm:h-10 sm:w-10 sm:text-base',
          isLight ? 'bg-slate-100 text-slate-500' : 'bg-white/5 text-white/60',
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-base font-bold sm:text-xl xl:text-2xl',
          isLight ? 'text-slate-900' : 'text-white')}>
          {row.picker}
        </div>
      </div>
      <div className="text-right">
        <span className={cn(
          'tabular-nums text-xl font-black tracking-tight sm:text-3xl xl:text-4xl',
          isLight ? board.accent.light : board.accent.dark,
        )}>
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
        active ? cn('w-8', accent) : 'w-2 bg-current opacity-20',
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
