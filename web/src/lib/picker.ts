// Picker route optimiser — given a list of SKUs (with optional qty), find
// the best location to pick each from and order the stops to minimise
// walking distance. The "distance" model is simple: aisles are visited
// in numeric order; within an aisle, bays are visited in bay-number
// order (serpentine through bays would be smarter but not measurably
// better for our warehouse layout).

import type { Inventory, SlotSummary } from './types'
import { allSlots } from './inventory'

export interface PickRequest {
  sku: string
  /** How many units to pick. Optional — defaults to "as many as needed". */
  qty?: number
}

export interface PickStop {
  /** Original request that this stop fulfils. */
  request: PickRequest
  /** The slot to pick from. */
  slot: SlotSummary
  /** Units to take from this slot — capped by what's on-hand. */
  pickQty: number
  /** Units still outstanding after this stop (for multi-location splits). */
  remaining: number
  /** Sequence number (1-based) for the picker. */
  step: number
  /** Heading (Aisle ID) — used to draw the path strip. */
  aisle: string
  /** Whether this stop changes aisle from the previous one. */
  newAisle: boolean
  /** Whether the SKU is unavailable anywhere (qty:0 on the slot). */
  outOfStock: boolean
}

export interface PickPlan {
  stops: PickStop[]
  /** SKUs that have NO source location with stock anywhere. */
  unfulfilled: { sku: string; qty: number }[]
  /** Distinct aisles to walk. */
  aisleSequence: string[]
}

/** Build a picker plan from a list of SKU requests. */
export function buildPickPlan(inv: Inventory, requests: PickRequest[]): PickPlan {
  const slots = allSlots(inv)

  // sku → all slots that hold it, sorted by units descending (pick from
  // the fullest box first; reduces splits)
  const skuSlots = new Map<string, SlotSummary[]>()
  for (const s of slots) {
    for (const e of s.skus) {
      if (e.qty <= 0) continue
      if (!skuSlots.has(e.sku)) skuSlots.set(e.sku, [])
      skuSlots.get(e.sku)!.push(s)
    }
  }
  for (const [, arr] of skuSlots) {
    arr.sort((a, b) => {
      const aQty = a.skus.find((x) => true)?.qty ?? 0
      const bQty = b.skus.find((x) => true)?.qty ?? 0
      return bQty - aQty
    })
  }

  // Pick assignments — may split across multiple slots when one isn't enough
  const assignments: { req: PickRequest; slot: SlotSummary; pickQty: number; remaining: number }[] = []
  const unfulfilled: { sku: string; qty: number }[] = []

  for (const req of requests) {
    const sources = skuSlots.get(req.sku) || []
    if (sources.length === 0) {
      unfulfilled.push({ sku: req.sku, qty: req.qty || 1 })
      continue
    }
    let remaining = req.qty ?? 1
    for (const slot of sources) {
      if (remaining <= 0) break
      const onHand = slot.skus.find((e) => e.sku === req.sku)?.qty ?? 0
      const take = Math.min(remaining, onHand)
      if (take <= 0) continue
      remaining -= take
      assignments.push({ req, slot, pickQty: take, remaining })
    }
    if (remaining > 0) {
      unfulfilled.push({ sku: req.sku, qty: remaining })
    }
  }

  // Sort assignments by walking order: aisle asc, bay asc, level asc, slot asc
  assignments.sort((a, b) => {
    const ka = locationSortKey(a.slot)
    const kb = locationSortKey(b.slot)
    return ka.localeCompare(kb)
  })

  const stops: PickStop[] = []
  let prevAisle = ''
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i]
    const newAisle = a.slot.aisle !== prevAisle
    stops.push({
      request: a.req,
      slot: a.slot,
      pickQty: a.pickQty,
      remaining: a.remaining,
      step: i + 1,
      aisle: a.slot.aisle,
      newAisle,
      outOfStock: false,
    })
    prevAisle = a.slot.aisle
  }

  const aisleSequence: string[] = []
  for (const s of stops) {
    if (aisleSequence[aisleSequence.length - 1] !== s.aisle) aisleSequence.push(s.aisle)
  }

  return { stops, unfulfilled, aisleSequence }
}

function locationSortKey(s: SlotSummary): string {
  return [s.aisle, s.bay, s.level, s.slot]
    .map((p) => p.replace(/\d+/g, (n) => n.padStart(5, '0')))
    .join('.')
}
