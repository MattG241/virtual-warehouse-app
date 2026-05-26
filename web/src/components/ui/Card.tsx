import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string
  children: ReactNode
  glow?: boolean
}

export function Card({ className, children, glow, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'glass rounded-xl shadow-card',
        glow && 'ring-1 ring-brand-ring/30 shadow-glow',
        className,
      )}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  eyebrow?: ReactNode
  action?: ReactNode
  className?: string
}

export function CardHeader({ title, eyebrow, action, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-2', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-0.5 text-[15px] font-semibold text-ink truncate">{title}</div>
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 pb-5', className)}>{children}</div>
}
