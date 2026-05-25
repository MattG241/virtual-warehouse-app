import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// Chrome / Edge / Android Chrome fire 'beforeinstallprompt' when the
// PWA is installable. We catch it, surface a small "Install app" pill,
// and call the saved event when the user taps it.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISSED_KEY = 'vw.installPromptDismissed'

export function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      setEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener)
    return () =>
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener)
  }, [])

  // Hide if already installed (browsers fire 'appinstalled')
  useEffect(() => {
    const onInstalled = () => {
      setEvt(null)
      try {
        localStorage.setItem(DISMISSED_KEY, '1')
      } catch {
        /* noop */
      }
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  if (!evt || dismissed) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 sm:bottom-6">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface/95 px-3 py-2 shadow-pop backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-300">
        <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
          <Download className="h-4 w-4" />
        </span>
        <div className="text-[12px] text-ink">
          <div className="font-semibold">Install Virtual Warehouse</div>
          <div className="text-muted">Add to your home screen for full-screen access.</div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await evt.prompt()
              await evt.userChoice
            } finally {
              setEvt(null)
            }
          }}
          className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-brand px-3 text-[12px] font-semibold text-white shadow-glow hover:opacity-95"
        >
          Install
        </button>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true)
            try {
              localStorage.setItem(DISMISSED_KEY, '1')
            } catch {
              /* noop */
            }
          }}
          className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
