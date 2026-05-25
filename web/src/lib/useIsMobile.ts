import { useEffect, useState } from 'react'

// Matches Tailwind's lg: breakpoint. Below lg = mobile UX layer (iOS-
// style flat lists, sheets, single-column flow); lg+ = desktop UX
// layer (bordered cards, multi-pane grids).
//
// Implemented with matchMedia so component-tree-wide swaps happen
// reactively when the viewport crosses the threshold (e.g. user
// rotates an iPad).
const MOBILE_QUERY = '(max-width: 1023.98px)'

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(MOBILE_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(MOBILE_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}
