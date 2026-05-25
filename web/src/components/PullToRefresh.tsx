import { useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  onRefresh: () => Promise<unknown> | unknown
  children: ReactNode
  /** Min pull (in px) before the refresh action fires. */
  threshold?: number
}

/**
 * Mobile-style pull-to-refresh wrapper. Renders an indicator above the
 * children that animates with the pull, then calls onRefresh when the
 * user releases past the threshold.
 *
 * Touch-only. On desktop the wrapper is a transparent passthrough.
 * Only triggers when scrollY === 0 so it doesn't fight with regular
 * scrolling.
 */
export function PullToRefresh({ onRefresh, children, threshold = 70 }: Props) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const active = useRef(false)

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return
      if (e.touches.length !== 1) return
      startY.current = e.touches[0].clientY
      active.current = true
    }
    function onTouchMove(e: TouchEvent) {
      if (!active.current || startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      // Resistance — distance grows ~sqrt(dy) so deeper pulls don't run away
      const resisted = Math.min(threshold * 1.5, Math.sqrt(dy * 32))
      setPull(resisted)
    }
    async function onTouchEnd() {
      if (!active.current) return
      active.current = false
      if (pull >= threshold && !refreshing) {
        setRefreshing(true)
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
        }
      }
      setPull(0)
      startY.current = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [pull, threshold, refreshing, onRefresh])

  const ready = pull >= threshold
  const visible = refreshing || pull > 0

  return (
    <>
      <div
        aria-hidden={!visible}
        className={cn(
          'pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center transition-opacity lg:hidden',
          visible ? 'opacity-100' : 'opacity-0',
        )}
        style={{ transform: `translateY(${Math.max(0, (refreshing ? threshold : pull) - 16)}px)` }}
      >
        <div
          className={cn(
            'mt-2 grid h-9 w-9 place-items-center rounded-full border border-line bg-surface shadow-pop',
            ready ? 'text-brand' : 'text-muted',
          )}
          style={{
            transform: refreshing
              ? undefined
              : `rotate(${Math.min(360, (pull / threshold) * 270)}deg)`,
          }}
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </div>
      </div>
      {children}
    </>
  )
}
