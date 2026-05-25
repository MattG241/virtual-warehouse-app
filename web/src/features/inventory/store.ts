import { create } from 'zustand'
import { fetchInventory } from '@/lib/api'
import type { Inventory } from '@/lib/types'

interface InventoryState {
  inventory: Inventory | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setInventory: (inv: Inventory) => void
}

export const useInventory = create<InventoryState>((set) => ({
  inventory: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const inv = await fetchInventory()
      set({ inventory: inv, loading: false })
    } catch (e) {
      set({ error: (e as Error).message, loading: false })
    }
  },
  setInventory: (inventory) => set({ inventory }),
}))
