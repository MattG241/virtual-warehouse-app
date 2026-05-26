import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, Package, PackageCheck, X, Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/cn'
import {
  fetchLeaderboard, fetchOrdersProgress,
  type LeaderboardRow, type LeaderboardWindow, type OrdersProgress,
} from '@/lib/api'
import { BADGES, badgesFor, type BadgeKey } from '@/lib/badges'
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

// Adelaide-local formatters cached at module scope. Rebuilding these
// every render on a 1Hz clock tick is the single biggest waste in the
// old layout — formatToParts() over a fresh Intl.DateTimeFormat is
// surprisingly expensive when it runs across the whole render tree.
const ADL_TZ = 'Australia/Adelaide'
const TIME_FMT = new Intl.DateTimeFormat('en-AU', {
  timeZone: ADL_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
})
const DATE_FMT = new Intl.DateTimeFormat('en-AU', {
  timeZone: ADL_TZ, weekday: 'long', day: 'numeric', month: 'long',
})

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
  const [orders, setOrders] = useState<OrdersProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    let ctl: AbortController | null = null
    let intervalId: number | null = null

    const load = () => {
      const c = new AbortController()
      ctl = c
      fetchOrdersProgress(c.signal)
        .then((o) => { if (!cancelled) setOrders(o) })
        .catch(() => undefined)
      Promise.all([
        fetchLeaderboard('today', c.signal).catch(() => null),
        fetchLeaderboard('week', c.signal).catch(() => null),
        fetchLeaderboard('month', c.signal).catch(() => null),
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
    }

    const start = () => {
      if (intervalId !== null) return
      load()
      intervalId = window.setInterval(() => { ctl?.abort(); load() }, REFRESH_MS)
    }
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
      ctl?.abort()
    }

    if (!document.hidden) start()

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    let intervalId: number | null = null
    const start = () => {
      if (intervalId !== null) return
      intervalId = window.setInterval(() => {
        setMode((m) => (m === 'pick' ? 'pack' : 'pick'))
      }, CYCLE_MS)
    }
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId)
        intervalId = null
      }
    }
    if (!document.hidden) start()
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
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

  // Double-click anywhere outside the toggles toggles fullscreen — easiest
  // way to get the warehouse TV into a chromeless display without keyboard.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Don't hijack double-clicks on interactive controls (pill toggles,
      // window switcher, close button) — those should keep their native
      // behaviour.
      if ((e.target as HTMLElement | null)?.closest?.('button')) return
      const fsEl =
        document.fullscreenElement ||
        // Safari prefix — kept for older WebKit
        (document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement
      const target = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>
      }
      const doc = document as Document & {
        webkitExitFullscreen?: () => Promise<void>
      }
      if (fsEl) {
        (doc.exitFullscreen?.() || doc.webkitExitFullscreen?.())?.catch?.(() => undefined)
      } else {
        (target.requestFullscreen?.() || target.webkitRequestFullscreen?.())?.catch?.(() => undefined)
      }
    }
    document.addEventListener('dblclick', handler)
    return () => document.removeEventListener('dblclick', handler)
  }, [])

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

  // News ticker — short headlines derived from current data, refreshes
  // when the data does. (v1; v2 could read a real milestone event log.)
  const tickerItems = useMemo(() => buildTicker(data), [data])

  // Confetti when #1 changes for this (mode, window) combo. Keyed map
  // so flipping between Today/WTD/MTD or Pick/Pack doesn't re-fire.
  const prevWinnerByKey = useRef<Record<string, string | null>>({})
  const [confettiKey, setConfettiKey] = useState(0)
  useEffect(() => {
    const key = `${mode}-${win}`
    const current = ranked[0]?.picker ?? null
    const prev = prevWinnerByKey.current[key]
    if (prev && current && current !== prev) {
      setConfettiKey((k) => k + 1)
    }
    prevWinnerByKey.current[key] = current
  }, [ranked, mode, win])

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
    <div className={cn('fixed inset-0 z-50 overflow-y-auto overflow-x-hidden transition-colors duration-500 md:overflow-hidden', t.bg, t.text)}>
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

      <div className="relative z-10 flex min-h-screen flex-col gap-3 p-4 sm:gap-4 sm:p-6 md:h-full md:min-h-0 md:overflow-hidden xl:p-8">
        {/* ── Header ───────────────────────────────────────────────── */}
        <header className={cn('flex flex-shrink-0 flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between', t.border)}>
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
          <LiveClock textMuted={t.textMuted} />
        </header>

        {/* ── Toolbar: category + window switcher ─────────────────── */}
        <div className="flex flex-shrink-0 flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          <div className="flex items-baseline gap-2 sm:gap-4">
            <board.Icon
              className={cn('h-6 w-6 sm:h-9 sm:w-9', isLight ? board.accent.light : board.accent.dark)}
            />
            <h2
              key={mode}
              className={cn(
                'text-[clamp(1.6rem,6.5vw,4.5rem)] font-black uppercase leading-none tracking-tight',
                isLight ? board.accent.light : board.accent.dark,
                'animate-[fadeUp_500ms_cubic-bezier(0.16,1,0.3,1)]',
              )}
            >
              {board.label}
            </h2>
            <span className={cn('hidden self-end pb-1 text-[10px] uppercase tracking-[0.25em] sm:inline sm:text-sm', t.textSubtle)}>
              by {board.metricLabel} · {windowMeta.label}
            </span>
          </div>

          <div className={cn('inline-flex w-full rounded-xl p-1 ring-1 md:w-auto', t.chipBg, t.cardRing)}>
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => setWin(w.key)}
                className={cn(
                  'flex-1 rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition sm:px-5 sm:text-sm md:flex-initial',
                  win === w.key ? t.pillActive + ' shadow-lg' : t.pillIdle,
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Morning-backlog progress bar ────────────────────────── */}
        {orders?.configured && orders.baseline && (
          <OrdersProgressBar orders={orders} isLight={isLight} />
        )}

        {/* ── Main ─────────────────────────────────────────────────── */}
        <main className="flex flex-1 flex-col gap-3 sm:gap-4 md:min-h-0 md:overflow-hidden">
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
              <Podium top={topThree} board={board} isLight={isLight} win={win} key={`${mode}-${win}-podium`} />
              {rest.length > 0 && (
                <ol className="grid grid-cols-1 content-start gap-2 md:min-h-0 md:flex-1 md:overflow-hidden xl:grid-cols-2 xl:gap-3">
                  {rest.map((r, i) => (
                    <RestRow
                      key={`${mode}-${win}-${r.picker}`}
                      row={r}
                      rank={i + 4}
                      board={board}
                      isLight={isLight}
                      win={win}
                    />
                  ))}
                </ol>
              )}
            </>
          )}
        </main>

        {/* ── News ticker ──────────────────────────────────────────── */}
        {tickerItems.length > 0 && (
          <NewsTicker items={tickerItems} isLight={isLight} borderClass={t.border} />
        )}

        {/* ── Badge legend ─────────────────────────────────────────── */}
        <BadgeLegend isLight={isLight} borderClass={t.border} />

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className={cn('flex flex-shrink-0 flex-col items-start gap-2 border-t pt-2 text-[10px] uppercase tracking-[0.2em] sm:flex-row sm:items-center sm:justify-between sm:text-[11px]', t.border, t.textMuted)}>
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

      <Confetti trigger={confettiKey} />

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
        @keyframes tickerSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes confettiFall {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg);                              opacity: 1; }
          100% { transform: translate3d(var(--cwobble, 0), 110vh, 0) rotate(var(--cspin, 720deg)); opacity: 0.55; }
        }
        .confetti-piece {
          position: absolute;
          top: -20px;
          width: 9px;
          height: 13px;
          border-radius: 2px;
          will-change: transform, opacity;
          animation: confettiFall var(--cdur, 3s) cubic-bezier(0.3, 0.8, 0.4, 1) forwards;
        }
      `}</style>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────

// Self-contained clock — owns its own tick state so the 1Hz update
// only re-renders this tiny subtree, not the whole leaderboard. Big
// freeze-prevention win on long-running TV sessions.
const LiveClock = memo(function LiveClock({ textMuted }: { textMuted: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    // Align ticks to the start of the next second so the digit changes
    // line up with wall-clock seconds.
    const drift = 1000 - (Date.now() % 1000)
    let intervalId: number | null = null
    const startInterval = () => {
      intervalId = window.setInterval(() => setNow(new Date()), 1000)
    }
    const timeoutId = window.setTimeout(() => {
      setNow(new Date())
      startInterval()
    }, drift)
    return () => {
      clearTimeout(timeoutId)
      if (intervalId !== null) clearInterval(intervalId)
    }
  }, [])
  return (
    <div className="flex items-end justify-between gap-3 md:flex-col md:items-end md:text-right">
      <div className="font-mono text-[clamp(2rem,9vw,4.5rem)] font-bold leading-none tabular-nums tracking-tight">
        {TIME_FMT.format(now)}
      </div>
      <p className={cn('text-[10px] uppercase tracking-[0.2em] sm:text-xs', textMuted)}>
        {DATE_FMT.format(now)}
      </p>
    </div>
  )
})

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">{children}</div>
  )
}

function Podium({
  top, board, isLight, win,
}: {
  top: LeaderboardRow[]
  board: BoardConfig
  isLight: boolean
  win: LeaderboardWindow
}) {
  return (
    <>
      {/* Mobile / small screens — stacked */}
      <div className="flex flex-col gap-3 md:hidden">
        <MobilePodiumHero row={top[0]} board={board} isLight={isLight} win={win} />
        {(top[1] || top[2]) && (
          <div className="grid grid-cols-2 gap-3">
            <MobilePodiumCard row={top[1]} rank={2} board={board} isLight={isLight} win={win} delayMs={140} />
            <MobilePodiumCard row={top[2]} rank={3} board={board} isLight={isLight} win={win} delayMs={220} />
          </div>
        )}
      </div>

      {/* Desktop / TV — classic 3-pillar podium */}
      <div className="hidden flex-shrink-0 grid-cols-3 items-end gap-6 md:grid xl:gap-10">
        <PodiumColumn row={top[1]} rank={2} height="h-[16vh]" board={board} isLight={isLight} win={win} delayMs={140} />
        <PodiumColumn row={top[0]} rank={1} height="h-[22vh]" board={board} isLight={isLight} win={win} delayMs={0} />
        <PodiumColumn row={top[2]} rank={3} height="h-[13vh]" board={board} isLight={isLight} win={win} delayMs={280} />
      </div>
    </>
  )
}

function PodiumColumn({
  row, rank, height, board, isLight, win, delayMs,
}: {
  row: LeaderboardRow | undefined
  rank: number
  height: string
  board: BoardConfig
  isLight: boolean
  win: LeaderboardWindow
  delayMs: number
}) {
  const isWinner = rank === 1
  const metalGradient = METAL_BY_RANK[rank]
  const badges = row ? badgesFor(row, rank, win) : []

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
                isWinner
                  ? 'text-[clamp(2.6rem,4.4vw,4.5rem)]'
                  : 'text-[clamp(1.8rem,3vw,3rem)]',
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
            {badges.length > 0 && (
              <BadgeRow badges={badges} size={isWinner ? 'xl' : 'lg'} />
            )}
          </>
        ) : (
          <>
            <span className={cn('mb-3 inline-flex h-11 items-center rounded-full px-4 text-sm font-bold uppercase tracking-wider',
              isLight ? 'bg-slate-100 text-slate-400' : 'bg-white/5 text-white/30')}>
              #{rank}
            </span>
            <p className={cn('text-[clamp(1.8rem,3vw,3rem)] font-bold', isLight ? 'text-slate-300' : 'text-white/30')}>—</p>
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

        {/* Big rank numeral on the pillar. Solid dark fill with both a
            white embossed shadow (light hitting top edge) and a soft
            black drop shadow (separation from background). Plus a thin
            stroke so the silhouette is crisp on the busy glitter. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              'select-none font-black leading-none tracking-tighter',
              isWinner ? 'text-[16vh]' : rank === 2 ? 'text-[12vh]' : 'text-[10vh]',
            )}
            style={{
              color: '#1c1310',
              WebkitTextStroke: '1.5px rgba(0,0,0,0.55)',
              textShadow:
                '0 4px 0 rgba(255,255,255,0.55), 0 -2px 0 rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.35)',
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
  row, board, isLight, win,
}: { row: LeaderboardRow | undefined; board: BoardConfig; isLight: boolean; win: LeaderboardWindow }) {
  const badges = row ? badgesFor(row, 1, win) : []
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
      <p className="relative z-10 mt-4 text-[clamp(1.8rem,7vw,2.8rem)] font-black uppercase leading-tight text-black/90 drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]">
        {row.picker}
      </p>
      {badges.length > 0 && (
        <div className="relative z-10 mt-3">
          <BadgeRow badges={badges} size="md" align="start" onDark={false} />
        </div>
      )}
    </div>
  )
}

function MobilePodiumCard({
  row, rank, board, isLight, win, delayMs,
}: {
  row: LeaderboardRow | undefined
  rank: number
  board: BoardConfig
  isLight: boolean
  win: LeaderboardWindow
  delayMs: number
}) {
  const badges = row ? badgesFor(row, rank, win) : []
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
        'relative z-10 mt-2 truncate text-xl font-black uppercase leading-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.25)] sm:text-2xl',
        row ? textColor : 'text-white/40',
      )}>
        {row?.picker ?? '—'}
      </p>
      {row && (
        <div className={cn('relative z-10 mt-0.5 text-[10px] font-bold uppercase tracking-wider', subText)}>
          {board.metricLabel}
        </div>
      )}
      {badges.length > 0 && (
        <div className="relative z-10 mt-2">
          <BadgeRow badges={badges} size="sm" align="start" onDark={false} />
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
  row, rank, board, isLight, win,
}: {
  row: LeaderboardRow
  rank: number
  board: BoardConfig
  isLight: boolean
  win: LeaderboardWindow
}) {
  const badges = badgesFor(row, rank, win)
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
        <div className="flex items-center gap-3">
          <div className={cn('truncate text-xl font-bold sm:text-2xl xl:text-3xl',
            isLight ? 'text-slate-900' : 'text-white')}>
            {row.picker}
          </div>
          {badges.length > 0 && (
            <BadgeRow badges={badges} size="xs" align="start" onDark={!isLight} />
          )}
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

const CONFETTI_COLORS = [
  '#fbbf24', '#22d3ee', '#f43f5e', '#a78bfa', '#10b981',
  '#fef3c7', '#f97316', '#3b82f6', '#ec4899',
]

function Confetti({ trigger }: { trigger: number }) {
  // Mount on trigger, auto-unmount once the longest piece has finished
  // animating. Stops 70 invisible spans piling up in the DOM after each
  // celebration on a long-running TV session.
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (trigger === 0) return
    setActive(true)
    // Longest possible run: 0.4s delay + 4s duration ≈ 4.4s, give it slack.
    const id = window.setTimeout(() => setActive(false), 5000)
    return () => clearTimeout(id)
  }, [trigger])
  // Memoise the piece config so re-renders triggered by parent state
  // don't reshuffle a celebration mid-flight.
  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 2.6 + Math.random() * 1.4,
        wobble: (Math.random() - 0.5) * 280,
        spin: (Math.random() * 4 + 2) * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [trigger],
  )
  if (!active) return null
  return (
    <div
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      aria-hidden
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            ['--cdur' as string]: `${p.duration}s`,
            ['--cwobble' as string]: `${p.wobble}px`,
            ['--cspin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
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

// ─── Badge row ──────────────────────────────────────────────────────────

const BADGE_PX: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string> = {
  xs: 'h-7 w-7 sm:h-8 sm:w-8',
  sm: 'h-10 w-10 sm:h-12 sm:w-12',
  md: 'h-12 w-12 sm:h-14 sm:w-14',
  lg: 'h-16 w-16 sm:h-20 sm:w-20',
  xl: 'h-20 w-20 sm:h-24 sm:w-24',
}

function BadgeRow({
  badges, size, align = 'center', onDark = false, max = 4,
}: {
  badges: BadgeKey[]
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'center' | 'start'
  onDark?: boolean
  max?: number
}) {
  if (badges.length === 0) return null
  const visible = badges.slice(0, max)
  const overflow = Math.max(0, badges.length - max)
  return (
    <div
      className={cn(
        'mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2',
        align === 'center' ? 'justify-center' : 'justify-start',
      )}
    >
      {visible.map((key) => {
        const meta = BADGES[key]
        return (
          <img
            key={key}
            src={meta.imageUrl}
            alt={meta.label}
            title={`${meta.label} — ${meta.description}`}
            className={cn(
              'flex-shrink-0 select-none drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]',
              BADGE_PX[size],
            )}
            loading="lazy"
            draggable={false}
          />
        )
      })}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums',
            BADGE_PX[size].replace(/w-\S+/g, '').replace(/h-\S+/g, ''),
            onDark
              ? 'bg-white/10 text-white/80 ring-1 ring-white/15'
              : 'bg-slate-900/15 text-slate-700 ring-1 ring-slate-300',
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

// ─── Badge legend ──────────────────────────────────────────────────────

// Short, scannable rule each badge denotes — different from BADGES[].description
// (the dashboard tooltip) because the TV legend must be readable from
// 5+ metres away. Aim for ≤ 14 characters per line.
const LEGEND_RULE: Record<BadgeKey, string> = {
  'daily-mvp': '#1 picker today',
  marathon:    '1,000+ items',
  'half-k':    '500+ items',
  century:     '100+ items',
  'pack-pro':  '100+ orders out',
  'clean-run': '0 skips today',
}

const LEGEND_ORDER: BadgeKey[] = [
  'daily-mvp', 'marathon', 'half-k', 'century', 'pack-pro', 'clean-run',
]

function BadgeLegend({
  isLight, borderClass,
}: { isLight: boolean; borderClass: string }) {
  return (
    <section
      className={cn(
        'flex flex-shrink-0 items-center gap-3 border-t pt-2 sm:gap-4',
        borderClass,
      )}
      aria-label="Badge legend"
    >
      <span
        className={cn(
          'hidden flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.32em] sm:inline',
          isLight ? 'text-slate-500' : 'text-white/40',
        )}
      >
        Earn
      </span>
      <ul className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-3 lg:grid-cols-6 lg:gap-x-4">
        {LEGEND_ORDER.map((key) => {
          const meta = BADGES[key]
          return (
            <li key={key} className="flex items-center gap-2 lg:gap-2.5">
              <img
                src={meta.imageUrl}
                alt={meta.label}
                className="h-9 w-9 flex-shrink-0 lg:h-10 lg:w-10"
                draggable={false}
              />
              <div className="min-w-0 leading-tight">
                <div
                  className={cn(
                    'text-[11px] font-bold uppercase tracking-wider lg:text-sm lg:truncate',
                    isLight ? 'text-slate-900' : 'text-white',
                  )}
                >
                  {meta.label}
                </div>
                <div
                  className={cn(
                    'text-[10px] lg:text-xs lg:truncate',
                    isLight ? 'text-slate-500' : 'text-white/50',
                  )}
                >
                  {LEGEND_RULE[key]}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─── Orders progress bar ───────────────────────────────────────────────

function OrdersProgressBar({
  orders, isLight,
}: {
  orders: OrdersProgress
  isLight: boolean
}) {
  if (!orders.baseline) return null
  const pct = orders.percent
  const goalReached = pct >= 100
  const newArrivals =
    orders.currentOpen != null
      ? Math.max(0, orders.currentOpen - orders.baseline.count)
      : 0
  // Honest capture-time label — show the actual local time the
  // baseline locked, not a generic "8am" claim that may be wrong if
  // we re-captured mid-day or at the 4pm reset.
  const capturedLocal = new Date(orders.baseline.capturedAt).toLocaleTimeString(
    'en-AU',
    { timeZone: 'Australia/Adelaide', hour: '2-digit', minute: '2-digit', hour12: false },
  )
  return (
    <section
      className={cn(
        'rounded-xl px-4 py-2.5 ring-1 sm:px-5 sm:py-3',
        isLight ? 'bg-white/70 ring-slate-200' : 'bg-white/[0.04] ring-white/10',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              'font-mono text-[10px] uppercase tracking-[0.24em] sm:text-[11px] sm:tracking-[0.32em]',
              isLight ? 'text-slate-500' : 'text-white/40',
            )}
          >
            Workload
          </p>
          <p
            className={cn(
              'text-xs',
              isLight ? 'text-slate-400' : 'text-white/40',
            )}
          >
            {orders.baseline.count} open at {capturedLocal}
          </p>
        </div>
        <div className="flex items-baseline gap-3 font-mono">
          <span
            className={cn(
              'tabular-nums text-2xl font-black leading-none tracking-tight sm:text-3xl',
              goalReached
                ? isLight ? 'text-emerald-700' : 'text-emerald-300'
                : isLight ? 'text-slate-900' : 'text-white',
            )}
          >
            {pct.toFixed(0)}<span className="text-base font-bold">%</span>
          </span>
          <span
            className={cn(
              'tabular-nums text-base',
              isLight ? 'text-slate-500' : 'text-white/60',
            )}
          >
            {orders.morningCleared} / {orders.baseline.count} cleared
          </span>
        </div>
      </div>
      <div
        className={cn(
          'mt-2 h-3 overflow-hidden rounded-full sm:h-3.5',
          isLight ? 'bg-slate-200' : 'bg-white/10',
        )}
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            goalReached
              ? 'bg-gradient-to-r from-emerald-400 via-emerald-300 to-emerald-500'
              : 'bg-gradient-to-r from-cyan-400 via-cyan-300 to-emerald-300',
          )}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      {orders.currentOpen != null && (
        <p
          className={cn(
            'mt-1.5 text-[10px] uppercase tracking-[0.18em] sm:text-xs',
            isLight ? 'text-slate-400' : 'text-white/35',
          )}
        >
          {goalReached ? '🎉 Workload cleared' : `${orders.currentOpen} still open`}
          {newArrivals > 0 && (
            <>
              {' · '}
              <span className={cn('font-semibold', isLight ? 'text-amber-700' : 'text-amber-300')}>
                +{newArrivals} new since baseline
              </span>
            </>
          )}
          {' · '}team shipped {orders.despatchedToday} today
        </p>
      )}
    </section>
  )
}

// ─── News ticker ────────────────────────────────────────────────────────

interface TvData {
  today: LeaderboardRow[] | null
  week: LeaderboardRow[] | null
  month: LeaderboardRow[] | null
  today_configured: boolean
  week_configured: boolean
  month_configured: boolean
  latest: string | null
}

function buildTicker(data: TvData): string[] {
  const sortBy = (rows: LeaderboardRow[] | null, key: keyof LeaderboardRow) => {
    if (!rows) return []
    return [...rows]
      .filter((r) => (r[key] as number) > 0)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
  }

  const todayPick = sortBy(data.today, 'items_picked')
  const todayPack = sortBy(data.today, 'items_despatched')
  const weekPick = sortBy(data.week, 'items_picked')
  const weekPack = sortBy(data.week, 'items_despatched')
  const monthPick = sortBy(data.month, 'items_picked')
  const monthPack = sortBy(data.month, 'items_despatched')

  const lines: string[] = []

  if (todayPick[0])
    lines.push(`${todayPick[0].picker} leads today's picking — ${fmtN(todayPick[0].items_picked)} items`)
  if (todayPick[0] && todayPick[1]) {
    const gap = (todayPick[0].items_picked as number) - (todayPick[1].items_picked as number)
    lines.push(`${todayPick[0].picker} ahead by ${fmtN(gap)} · ${todayPick[1].picker} chasing`)
  }
  if (todayPack[0])
    lines.push(`${todayPack[0].picker} top of today's packing — ${fmtN(todayPack[0].items_despatched)} items despatched`)
  if (weekPick[0])
    lines.push(`${weekPick[0].picker} leads WTD picking with ${fmtN(weekPick[0].items_picked)} items`)
  if (weekPack[0])
    lines.push(`${weekPack[0].picker} leads WTD packing — ${fmtN(weekPack[0].items_despatched)} items out the door`)
  if (monthPick[0])
    lines.push(`${monthPick[0].picker} tops month-to-date with ${fmtN(monthPick[0].items_picked)} items picked`)
  if (monthPack[0])
    lines.push(`${monthPack[0].picker} leads MTD packing — ${fmtN(monthPack[0].items_despatched)} items shipped`)
  if (todayPick.length >= 3) {
    const top3 = todayPick.slice(0, 3).map((r, i) => `#${i + 1} ${r.picker}`).join(' · ')
    lines.push(`Today's picking podium: ${top3}`)
  }
  if (todayPick.length >= 3) {
    const total = todayPick.reduce((s, r) => s + (r.items_picked as number), 0)
    lines.push(`Floor total today: ${fmtN(total)} items picked across ${todayPick.length} pickers`)
  }

  return lines
}

function NewsTicker({
  items, isLight, borderClass,
}: {
  items: string[]
  isLight: boolean
  borderClass: string
}) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    if (items.length <= 1) return
    const id = setInterval(() => setIdx((i) => (i + 1) % items.length), 5000)
    return () => clearInterval(id)
  }, [items.length])

  if (items.length === 0) return null
  // Reset to 0 if items shrink under current index
  const safeIdx = idx % items.length

  return (
    <div className={cn('flex flex-shrink-0 items-center gap-3 border-t pt-2 sm:gap-4', borderClass)}>
      <span
        className={cn(
          'inline-flex h-6 flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-black uppercase tracking-[0.18em] ring-1',
          isLight
            ? 'bg-rose-50 text-rose-700 ring-rose-200'
            : 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
        )}
      >
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
        </span>
        Live
      </span>
      <div className="relative min-w-0 flex-1">
        <div
          key={safeIdx}
          className={cn(
            'text-[13px] font-semibold leading-snug sm:text-sm xl:truncate xl:text-base xl:leading-normal',
            isLight ? 'text-slate-700' : 'text-white/80',
          )}
          style={{ animation: 'tickerSlide 500ms cubic-bezier(0.16,1,0.3,1) both' }}
        >
          {items[safeIdx]}
        </div>
      </div>
    </div>
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
