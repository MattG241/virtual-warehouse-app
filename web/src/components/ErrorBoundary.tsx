import { Component, type ReactNode } from 'react'
import { AlertOctagon, RotateCcw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Top-level error boundary. Catches render-time exceptions anywhere
 * downstream and shows an actionable fallback instead of the default
 * white screen. The user can retry (reset state) or go home.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[error-boundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg p-6 text-ink">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-bad/15 text-bad">
              <AlertOctagon className="h-7 w-7" />
            </span>
            <h2 className="text-xl font-bold text-ink">Something went wrong</h2>
            <p className="max-w-sm text-sm text-muted">
              The page hit an unexpected error. Try the action below — if it
              keeps happening, share the message below with the developer.
            </p>
            <details className="w-full overflow-hidden rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-left text-[11px]">
              <summary className="cursor-pointer font-semibold text-muted">
                Technical details
              </summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-bad">
                {error.message}
              </pre>
            </details>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white shadow-glow hover:opacity-95"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
              <a
                href="/"
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-muted hover:border-line-strong hover:text-ink"
              >
                <Home className="h-4 w-4" />
                Home
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }
}
