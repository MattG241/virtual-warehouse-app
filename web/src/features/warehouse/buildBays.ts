import type { Inventory, SlotSummary } from '@/lib/types'
import { allSlots } from '@/lib/inventory'

export interface BayShape {
  bay: string
  levels: { level: string; slots: SlotSummary[] }[]
}

/** Group all slots in an aisle by bay → level → slot. */
export function baysForAisle(inv: Inventory, aisleId: string): BayShape[] {
  const slots = allSlots(inv).filter((s) => s.aisle === aisleId)
  const byBay = new Map<string, Map<string, SlotSummary[]>>()
  for (const s of slots) {
    if (!byBay.has(s.bay)) byBay.set(s.bay, new Map())
    const levels = byBay.get(s.bay)!
    if (!levels.has(s.level)) levels.set(s.level, [])
    levels.get(s.level)!.push(s)
  }

  // Sort bays asc (B01, B02…) and shelves descending (top level first so the
  // visualisation matches reality — L07 on top, L01 on the ground).
  // For each shelf, trim trailing slots that have no stock data anywhere in
  // the whole warehouse for that slot position — that's the "no S7 anywhere
  // → don't render the column" rule.
  const slotUsedAnywhere = new Set<string>()
  for (const code of Object.keys(inv.grid)) {
    const m = /\.S(\d+)$/.exec(code)
    if (m) slotUsedAnywhere.add(`S${m[1]}`)
  }
  const slotExists = (slotId: string) => slotUsedAnywhere.has(slotId)

  const result: BayShape[] = []
  const bayIds = [...byBay.keys()].sort()
  for (const bay of bayIds) {
    const levelsMap = byBay.get(bay)!
    const levels = [...levelsMap.keys()]
      .sort()
      .reverse()
      .map((level) => {
        let slots = levelsMap
          .get(level)!
          .sort((a, b) => a.slot.localeCompare(b.slot, undefined, { numeric: true }))
        // Drop trailing slot positions that don't exist anywhere in the
        // warehouse. Keep middle gaps so the visual lines up bay-to-bay.
        while (slots.length > 0 && !slotExists(slots[slots.length - 1].slot)) {
          slots.pop()
        }
        return { level, slots }
      })
    result.push({ bay, levels })
  }
  return result
}
