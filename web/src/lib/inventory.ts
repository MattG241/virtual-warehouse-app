// Derived selectors over an Inventory snapshot. Pure functions — no React.

import type { Inventory, KpiSummary, SlotSummary, Status } from './types'

const CODE_RE = /^A(\d+)\.B(\d+)\.L(\d+)\.S(\d+)$/i

// Thresholds drive the four box-state colours in the rack visualisation:
// blue (empty) → red (critical) → orange (low) → green (healthy).
// Tuned so a "critical" call is unmistakable and a "low" call still has
// enough buffer to action overnight rather than urgently.
export const CRITICAL_THRESHOLD = 2
export const LOW_THRESHOLD = 5

export function statusFor(qty: number): Status {
  if (qty <= 0) return 'empty'
  if (qty <= CRITICAL_THRESHOLD) return 'critical'
  if (qty <= LOW_THRESHOLD) return 'low'
  return 'healthy'
}

export function parseCode(code: string) {
  const m = CODE_RE.exec(code)
  if (!m) return null
  return {
    aisle: `A${m[1].padStart(2, '0')}`,
    bay: `B${m[2].padStart(2, '0')}`,
    level: `L${m[3].padStart(2, '0')}`,
    slot: `S${m[4]}`,
  }
}

// Canonical slot key: aisle/bay/level zero-padded to 2 digits, slot NOT padded.
// Accepts loose user / scanner input — "A3.B06.L05.S6", "A03.B6.L5.S06",
// lower-case, surrounding whitespace — and returns the form the server emits
// in `inventory.grid`. Returns null if the input doesn't look like a slot code.
export function normalizeLocationCode(raw: string): string | null {
  const m = CODE_RE.exec(raw.trim())
  if (!m) return null
  return `A${String(Number(m[1])).padStart(2, '0')}.B${String(Number(m[2])).padStart(2, '0')}.L${String(Number(m[3])).padStart(2, '0')}.S${Number(m[4])}`
}

/** All physical slots, derived from aisleBays × levels × slots, merged with
 *  whatever grid actually carries stock. Stable across renders. */
export function allSlots(inv: Inventory): SlotSummary[] {
  const out: SlotSummary[] = []
  const levels = inv.levels || 7
  const slots = inv.slots || 7

  const aisleIds = Object.keys(inv.aisleBays)
    .map(Number)
    .sort((a, b) => a - b)

  for (const aisleNum of aisleIds) {
    const aisle = `A${String(aisleNum).padStart(2, '0')}`
    const bayCount = inv.aisleBays[String(aisleNum)] || 0
    for (let bay = 1; bay <= bayCount; bay++) {
      const bayId = `B${String(bay).padStart(2, '0')}`
      for (let level = 1; level <= levels; level++) {
        const levelId = `L${String(level).padStart(2, '0')}`
        for (let slot = 1; slot <= slots; slot++) {
          const slotId = `S${slot}`
          const code = `${aisle}.${bayId}.${levelId}.${slotId}`
          const entries = inv.grid[code] || []
          const totalUnits = entries.reduce((s, [, q]) => s + (Number(q) || 0), 0)
          out.push({
            code,
            aisle,
            bay: bayId,
            level: levelId,
            slot: slotId,
            totalUnits,
            status: statusFor(totalUnits),
            skus: entries.map(([sku, qty]) => ({
              sku,
              qty: Number(qty) || 0,
              name: inv.skus[sku]?.[0] || '',
            })),
          })
        }
      }
    }
  }
  return out
}

export function summarize(inv: Inventory): KpiSummary {
  const slots = allSlots(inv)
  const totalSlots = slots.length
  let emptySlots = 0
  let lowSlots = 0
  let stockedSlots = 0
  let totalUnits = 0
  const baysWithStock = new Set<string>()
  const aislesWithStock = new Set<string>()

  for (const s of slots) {
    totalUnits += s.totalUnits
    if (s.status === 'empty') emptySlots++
    else if (s.status === 'low') {
      lowSlots++
      stockedSlots++
      baysWithStock.add(`${s.aisle}.${s.bay}`)
      aislesWithStock.add(s.aisle)
    } else {
      stockedSlots++
      baysWithStock.add(`${s.aisle}.${s.bay}`)
      aislesWithStock.add(s.aisle)
    }
  }

  // Count empty bays/aisles vs total physical
  const aisleCount = Object.keys(inv.aisleBays).length
  const totalBays = Object.values(inv.aisleBays).reduce((s, v) => s + v, 0)

  return {
    totalUnits,
    distinctSkus: Object.keys(inv.skus).length,
    stockedSlots,
    totalSlots,
    emptySlots,
    lowSlots,
    emptyBays: Math.max(0, totalBays - baysWithStock.size),
    emptyAisles: Math.max(0, aisleCount - aislesWithStock.size),
    fullnessPct: totalSlots ? Math.round((stockedSlots / totalSlots) * 100) : 0,
  }
}

/** Per-aisle fullness + stock totals, ordered by aisle id. */
export function perAisle(inv: Inventory) {
  const slots = allSlots(inv)
  const map = new Map<
    string,
    { aisle: string; totalUnits: number; stocked: number; total: number; lowCount: number }
  >()
  for (const s of slots) {
    let agg = map.get(s.aisle)
    if (!agg) {
      agg = { aisle: s.aisle, totalUnits: 0, stocked: 0, total: 0, lowCount: 0 }
      map.set(s.aisle, agg)
    }
    agg.total++
    agg.totalUnits += s.totalUnits
    if (s.status !== 'empty') agg.stocked++
    if (s.status === 'low') agg.lowCount++
  }
  return [...map.values()].sort((a, b) => a.aisle.localeCompare(b.aisle))
}

export interface SkuSummary {
  sku: string
  name: string
  totalUnits: number
  locations: number
  status: Status
  color?: string
  size?: string
}

/** Per-SKU rollup across every grid location + other-locations. Sorted by
 *  units descending so the busiest items lead.
 *
 *  Includes every known SKU (from inv.skus), even ones with zero stock
 *  everywhere — so true zero-stock SKUs surface correctly in alerts and
 *  inventory filters. Without this, a SKU that has nothing in grid/other
 *  silently disappeared.
 */
export function perSku(inv: Inventory): SkuSummary[] {
  const map = new Map<string, { units: number; locs: Set<string> }>()

  // Seed every known SKU so zero-stock items aren't dropped
  for (const sku of Object.keys(inv.skus)) {
    map.set(sku, { units: 0, locs: new Set() })
  }

  for (const [code, entries] of Object.entries(inv.grid)) {
    for (const [sku, qty] of entries) {
      const n = Number(qty) || 0
      if (!map.has(sku)) map.set(sku, { units: 0, locs: new Set() })
      const agg = map.get(sku)!
      agg.units += n
      if (n > 0) agg.locs.add(code)
    }
  }
  for (const row of inv.other) {
    const [loc, sku, qty] = row
    const n = Number(qty) || 0
    if (!map.has(sku)) map.set(sku, { units: 0, locs: new Set() })
    const agg = map.get(sku)!
    agg.units += n
    if (n > 0) agg.locs.add(String(loc))
  }
  const out: SkuSummary[] = []
  for (const [sku, agg] of map) {
    const meta = inv.skus[sku]
    out.push({
      sku,
      name: meta?.[0] || '',
      color: meta?.[1] || undefined,
      size: meta?.[2] || undefined,
      totalUnits: agg.units,
      locations: agg.locs.size,
      status: statusFor(agg.units),
    })
  }
  return out.sort((a, b) => b.totalUnits - a.totalUnits)
}

/** Format helpers */
export function fmtN(n: number) {
  return Number(n || 0).toLocaleString()
}

export function fmtPct(n: number) {
  return `${Math.round(n)}%`
}

/** Relative time, no library. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (!t) return 'never'
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
