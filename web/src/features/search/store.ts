import { create } from 'zustand'

interface SearchState {
  isOpen: boolean
  /** When set, the overlay seeds its input with this string on open. */
  initialQuery: string
  open: (q?: string) => void
  close: () => void
  toggle: () => void
}

export const useSearch = create<SearchState>((set, get) => ({
  isOpen: false,
  initialQuery: '',
  open: (q?: string) => set({ isOpen: true, initialQuery: q || '' }),
  close: () => set({ isOpen: false, initialQuery: '' }),
  toggle: () => set({ isOpen: !get().isOpen, initialQuery: '' }),
}))
