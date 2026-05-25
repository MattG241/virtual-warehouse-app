import { create } from 'zustand'
import { fetchMe, login as apiLogin, logout as apiLogout, registerUser, type User } from '@/lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  /** Has the initial /me check completed? Used to suppress UI flicker. */
  ready: boolean
  refresh: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  ready: false,

  refresh: async () => {
    try {
      const user = await fetchMe()
      set({ user, ready: true })
    } catch {
      set({ user: null, ready: true })
    }
  },

  signIn: async (email, password) => {
    set({ loading: true })
    try {
      const res = await apiLogin(email, password)
      set({ user: res.user, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  signUp: async (email, password) => {
    set({ loading: true })
    try {
      const res = await registerUser(email, password)
      set({ user: res.user, loading: false })
    } catch (err) {
      set({ loading: false })
      throw err
    }
  },

  signOut: async () => {
    await apiLogout()
    set({ user: null })
  },
}))
