import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Mode = 'light' | 'dark'
export type Accent = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose'

interface ThemeState {
  mode: Mode
  accent: Accent
  setMode: (m: Mode) => void
  setAccent: (a: Accent) => void
  toggleMode: () => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      accent: 'blue',
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
      toggleMode: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
    }),
    { name: 'vw.theme' },
  ),
)

/** Apply the current theme to <html>. Called once on mount + on changes. */
export function applyTheme(state: { mode: Mode; accent: Accent }) {
  const root = document.documentElement
  root.classList.toggle('dark', state.mode === 'dark')
  if (state.accent && state.accent !== 'blue') {
    root.setAttribute('data-accent', state.accent)
  } else {
    root.removeAttribute('data-accent')
  }
  // Update browser chrome colour to match
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', state.mode === 'dark' ? '#070b14' : '#f4f6fa')
  }
}
