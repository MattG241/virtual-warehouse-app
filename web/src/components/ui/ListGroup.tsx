// iOS Settings-style grouped list. The mobile UI uses these in place
// of bordered cards — no edge frame, just a translucent surface fill
// with thin dividers between rows.

import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

interface ListGroupProps {
  title?: string
  footnote?: string
  className?: string
  children: ReactNode
}

export function ListGroup({ title, footnote, className, children }: ListGroupProps) {
  return (
    <section className={cn('-mx-4', className)}>
      {title && (
        <h3 className="mb-1.5 px-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {title}
        </h3>
      )}
      <ul className="divide-y divide-line/60 bg-surface/60 backdrop-blur-md">{children}</ul>
      {footnote && (
        <p className="mt-1.5 px-5 text-[11px] leading-relaxed text-muted">{footnote}</p>
      )}
    </section>
  )
}

interface ListRowProps {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  /** Adds a chevron at the right. Suppressed when `trailing` provided. */
  chevron?: boolean
  onClick?: () => void
  active?: boolean
  className?: string
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  chevron,
  onClick,
  active,
  className,
}: ListRowProps) {
  const isInteractive = Boolean(onClick)
  const Tag = (isInteractive ? 'button' : 'div') as 'button' | 'div'
  return (
    <li>
      <Tag
        type={isInteractive ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 px-5 py-3 text-left transition',
          isInteractive && 'active:bg-surface-2',
          active && 'bg-brand/10',
          className,
        )}
      >
        {leading && <span className="flex-shrink-0">{leading}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{title}</span>
          {subtitle && (
            <span className="block truncate text-[12px] text-muted">{subtitle}</span>
          )}
        </span>
        {trailing ? (
          <span className="flex-shrink-0 text-right text-[13px] text-muted">{trailing}</span>
        ) : chevron && isInteractive ? (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-subtle" />
        ) : null}
      </Tag>
    </li>
  )
}
