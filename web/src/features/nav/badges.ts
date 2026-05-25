// Centralised computation of the unread/attention counts displayed as
// badges on the nav (sidebar + mobile tab bar). Kept here so every nav
// surface reads the same numbers.

import { useMemo } from 'react'
import { useInventory } from '@/features/inventory/store'
import { perSku, perAisle } from '@/lib/inventory'

export interface NavBadges {
  /** SKUs at critical level (≤ 2 units). The "needs attention now" count. */
  alerts: number
  /** Slots tagged "low" needing replenishment. */
  replen: number
}

export function useNavBadges(): NavBadges {
  const inv = useInventory((s) => s.inventory)
  return useMemo(() => {
    if (!inv) return { alerts: 0, replen: 0 }
    const skus = perSku(inv)
    const aisles = perAisle(inv)
    let critical = 0
    for (const s of skus) if (s.status === 'critical') critical++
    let low = 0
    for (const a of aisles) low += a.lowCount
    return { alerts: critical, replen: low }
  }, [inv])
}
