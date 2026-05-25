// Replenishment helpers — derive "needs pulling" + "available for put-away"
// from the current inventory snapshot. Pure functions; no React.

import type { Inventory, SlotSummary } from './types'
import { allSlots } from './inventory'

export interface PullSuggestion {
  /** The low/critical slot that needs stock. */
  target: SlotSummary
  /** Best source(s) — other slots holding the same SKU with healthy stock. */
  sources: { code: string; sku: string; qty: number; aisle: string }[]
}

/** For every critical/low slot, find other locations of the SAME SKU with
 *  enough stock to top up. Sorted so the most urgent (lowest current units)
 *  surface first, then closest physical neighbour by aisle. */
export function pullSuggestions(inv: Inventory): PullSuggestion[] {
  const slots = allSlots(inv)
  const lowSlots = slots
    .filter((s) => (s.status === 'critical' || s.status === 'low') && s.skus.length > 0)
    .sort((a, b) => a.totalUnits - b.totalUnits)

  // Index: sku → list of holding locations (code, qty, aisle)
  type Holder = { code: string; qty: number; aisle: string }
  const skuHolders = new Map<string, Holder[]>()
  for (const s of slots) {
    for (const e of s.skus) {
      if (e.qty <= 5) continue // only count healthy stock as a "source"
      if (!skuHolders.has(e.sku)) skuHolders.set(e.sku, [])
      skuHolders.get(e.sku)!.push({ code: s.code, qty: e.qty, aisle: s.aisle })
    }
  }
  // Also consider the "other" overflow locations as candidate sources.
  for (const [loc, sku, qty] of inv.other) {
    const n = Number(qty) || 0
    if (n <= 5) continue
    if (!skuHolders.has(sku)) skuHolders.set(sku, [])
    skuHolders.get(sku)!.push({ code: String(loc), qty: n, aisle: 'OTHER' })
  }

  const out: PullSuggestion[] = []
  for (const target of lowSlots) {
    const sources: PullSuggestion['sources'] = []
    for (const e of target.skus) {
      const candidates = skuHolders.get(e.sku) || []
      for (const c of candidates) {
        if (c.code === target.code) continue
        sources.push({ code: c.code, sku: e.sku, qty: c.qty, aisle: c.aisle })
      }
    }
    // Prefer same-aisle sources first, then highest qty
    sources.sort((a, b) => {
      const aSame = a.aisle === target.aisle ? 0 : 1
      const bSame = b.aisle === target.aisle ? 0 : 1
      if (aSame !== bSame) return aSame - bSame
      return b.qty - a.qty
    })
    out.push({ target, sources: sources.slice(0, 4) })
  }
  return out
}

export interface PutAway {
  code: string
  aisle: string
  bay: string
  level: string
  slot: string
}

/** Empty slots, grouped by aisle then bay, ready for put-away of new stock. */
export function emptySlots(inv: Inventory): PutAway[] {
  return allSlots(inv)
    .filter((s) => s.status === 'empty')
    .map((s) => ({
      code: s.code,
      aisle: s.aisle,
      bay: s.bay,
      level: s.level,
      slot: s.slot,
    }))
}

export function emptiesByAisle(empties: PutAway[]) {
  const map = new Map<string, PutAway[]>()
  for (const e of empties) {
    if (!map.has(e.aisle)) map.set(e.aisle, [])
    map.get(e.aisle)!.push(e)
  }
  return [...map.entries()]
    .map(([aisle, slots]) => ({ aisle, slots }))
    .sort((a, b) => a.aisle.localeCompare(b.aisle))
}
