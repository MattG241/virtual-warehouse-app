import { cn } from '@/lib/cn'
import type { Status } from '@/lib/types'

interface Props {
  status: Status
  className?: string
}

const LABELS: Record<Status, string> = {
  empty: 'Empty',
  low: 'Low',
  healthy: 'Stocked',
}

const STYLES: Record<Status, string> = {
  empty: 'bg-bad/15 text-bad ring-bad/30',
  low: 'bg-warn/15 text-warn ring-warn/30',
  healthy: 'bg-good/15 text-good ring-good/30',
}

export function StatusPill({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
        STYLES[status],
        className,
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'empty' && 'bg-bad',
          status === 'low' && 'bg-warn',
          status === 'healthy' && 'bg-good',
        )}
      />
      {LABELS[status]}
    </span>
  )
}
