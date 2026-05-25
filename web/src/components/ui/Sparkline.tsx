import { useMemo } from 'react'
import { cn } from '@/lib/cn'

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  /** Color tone — defaults to brand */
  tone?: 'brand' | 'good' | 'warn' | 'bad'
  fill?: boolean
}

const TONE_TO_STROKE: Record<NonNullable<SparklineProps['tone']>, string> = {
  brand: 'stroke-brand',
  good: 'stroke-good',
  warn: 'stroke-warn',
  bad: 'stroke-bad',
}
const TONE_TO_FILL: Record<NonNullable<SparklineProps['tone']>, string> = {
  brand: 'fill-brand/15',
  good: 'fill-good/15',
  warn: 'fill-warn/15',
  bad: 'fill-bad/15',
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  className,
  tone = 'brand',
  fill = true,
}: SparklineProps) {
  const { path, area } = useMemo(() => {
    if (!data.length) return { path: '', area: '' }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const range = max - min || 1
    const stepX = data.length > 1 ? width / (data.length - 1) : 0
    const pts = data.map((v, i) => {
      const x = i * stepX
      const y = height - ((v - min) / range) * (height - 4) - 2
      return [x, y] as const
    })
    const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join('')
    const area = `${path} L${pts[pts.length - 1][0]},${height} L0,${height} Z`
    return { path, area }
  }, [data, width, height])

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      {fill && <path d={area} className={cn('stroke-none', TONE_TO_FILL[tone])} />}
      <path
        d={path}
        className={cn('fill-none', TONE_TO_STROKE[tone])}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
