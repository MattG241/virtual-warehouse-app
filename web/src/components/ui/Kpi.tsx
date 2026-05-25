import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Sparkline } from './Sparkline'

interface KpiProps {
  label: string
  value: ReactNode
  unit?: string
  /** Optional secondary line (e.g. "7,779 distinct SKUs") */
  hint?: string
  /** % delta vs prior period — positive renders green, negative red */
  delta?: number
  /** Tone for the sparkline / accent */
  tone?: 'brand' | 'good' | 'warn' | 'bad'
  /** Optional sparkline data */
  series?: number[]
  icon?: ReactNode
  className?: string
}

const TONE_BG: Record<NonNullable<KpiProps['tone']>, string> = {
  brand: 'from-brand/20 to-transparent',
  good: 'from-good/20 to-transparent',
  warn: 'from-warn/20 to-transparent',
  bad: 'from-bad/20 to-transparent',
}

const TONE_ICON_BG: Record<NonNullable<KpiProps['tone']>, string> = {
  brand: 'bg-brand/15 text-brand',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
}

export function Kpi({
  label,
  value,
  unit,
  hint,
  delta,
  tone = 'brand',
  series,
  icon,
  className,
}: KpiProps) {
  return (
    <div
      className={cn(
        'glass relative overflow-hidden rounded-xl p-5 shadow-card',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90',
          TONE_BG[tone],
        )}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {icon && (
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-md',
                  TONE_ICON_BG[tone],
                )}
              >
                {icon}
              </span>
            )}
            <span className="truncate">{label}</span>
          </div>
          <div className="tnum mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold leading-none text-ink">{value}</span>
            {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
          </div>
          {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
          {typeof delta === 'number' && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                delta >= 0 ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad',
              )}
            >
              {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        {series && series.length > 0 && (
          <Sparkline data={series} tone={tone} width={88} height={40} />
        )}
      </div>
    </div>
  )
}
