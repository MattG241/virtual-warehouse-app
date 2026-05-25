// Inventory snapshot shape — mirrors server/shape.js buildWarehouseData().

export type GridEntry = [sku: string, qty: number, locationType: string]
export type OtherRow = [
  location: string,
  sku: string,
  qty: number,
  locationType: string,
  itemTypeGroup: string,
]
export type SkuMeta = [name: string, color: string, size: string]

export interface SyncStatus {
  id: number
  finishedAt: string
  rowCount: number
}

export interface Inventory {
  generatedAt: string
  rowCount: number
  aisleBays: Record<string, number>
  levels: number
  slots: number
  skus: Record<string, SkuMeta>
  barcodeToSku: Record<string, string>
  grid: Record<string, GridEntry[]>
  other: OtherRow[]
  layout: unknown
  syncStatus: SyncStatus | null
}

export type Status = 'empty' | 'critical' | 'low' | 'healthy'

export interface SlotSummary {
  code: string // A01.B01.L01.S1
  aisle: string // A01
  bay: string // B01
  level: string // L01
  slot: string // S1
  totalUnits: number
  status: Status
  skus: { sku: string; qty: number; name: string }[]
}

export interface KpiSummary {
  totalUnits: number
  distinctSkus: number
  stockedSlots: number
  totalSlots: number
  emptySlots: number
  lowSlots: number
  emptyBays: number
  emptyAisles: number
  fullnessPct: number
}
