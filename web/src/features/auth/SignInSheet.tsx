import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, LogIn, UserPlus, AlertCircle } from 'lucide-react'
import { useAuth } from './store'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onClose: () => void
}

type Mode = 'signin' | 'signup'

export function SignInSheet({ open, onClose }: Props) {
  const signIn = useAuth((s) => s.signIn)
  const signUp = useAuth((s) => s.signUp)
  const loading = useAuth((s) => s.loading)
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      if (mode === 'signin') await signIn(email.trim(), password)
      else await signUp(email.trim(), password)
      onClose()
      setEmail('')
      setPassword('')
    } catch (e) {
      setErr((e as Error).message || 'failed')
    }
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
        aria-hidden
        onClick={onClose}
      />
      <div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-labelledby="signin-heading"
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2/40 px-5 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                {mode === 'signin' ? 'Welcome back' : 'Get started'}
              </div>
              <h2 id="signin-heading" className="text-base font-semibold text-ink">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <form className="space-y-3 p-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Email
              </span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
                placeholder="you@company.com"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted">
                Password
              </span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
                placeholder="••••••••"
              />
              {mode === 'signup' && (
                <span className="mt-1 block text-[11px] text-muted">
                  Minimum 8 characters.
                </span>
              )}
            </label>

            {err && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span className="min-w-0">{err}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              className="!w-full"
              icon={mode === 'signin' ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            >
              {loading
                ? 'Working…'
                : mode === 'signin'
                  ? 'Sign in'
                  : 'Create account'}
            </Button>

            <div className="pt-1 text-center text-[12px] text-muted">
              {mode === 'signin' ? (
                <>
                  No account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup')
                      setErr(null)
                    }}
                    className={cn('font-semibold text-brand hover:underline')}
                  >
                    Create one
                  </button>
                </>
              ) : (
                <>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signin')
                      setErr(null)
                    }}
                    className="font-semibold text-brand hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body,
  )
}
