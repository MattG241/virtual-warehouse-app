import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Keyboard } from 'lucide-react'

/**
 * ⌘? (Mac) / Ctrl+? (Windows / Linux) — opens a modal listing every
 * keyboard shortcut in the app. Esc closes.
 */
const SHORTCUTS: { keys: string[]; label: string; section: string }[] = [
  { section: 'Navigation', keys: ['⌘', 'K'], label: 'Open search' },
  { section: 'Navigation', keys: ['Esc'], label: 'Close any overlay' },
  { section: 'Navigation', keys: ['?'], label: 'Open this shortcuts list' },

  { section: 'Search overlay', keys: ['↑', '↓'], label: 'Move between results' },
  { section: 'Search overlay', keys: ['↵'], label: 'Open selected result' },

  { section: 'Replenish / Pick', keys: ['Tap step #'], label: 'Mark stop as picked' },
  { section: 'Replenish / Pick', keys: ['Tap location code'], label: 'Jump into the warehouse view' },

  { section: 'Customise', keys: ['Gear icon'], label: 'Theme, accent, dashboard widgets' },
]

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Question-mark — ignore when typing into a field.
      if (
        e.key === '?' &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const grouped = new Map<string, typeof SHORTCUTS>()
  for (const s of SHORTCUTS) {
    if (!grouped.has(s.section)) grouped.set(s.section, [])
    grouped.get(s.section)!.push(s)
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in"
        aria-hidden
        onClick={() => setOpen(false)}
      />
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={() => setOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-pop animate-in slide-in-from-bottom-4 fade-in duration-200"
        >
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink">
              <Keyboard className="h-4 w-4" />
              Keyboard shortcuts
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="max-h-[70dvh] overflow-y-auto">
            {[...grouped.entries()].map(([section, items]) => (
              <div key={section} className="border-b border-line last:border-b-0">
                <div className="px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {section}
                </div>
                <ul>
                  {items.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                    >
                      <span className="text-ink">{s.label}</span>
                      <div className="flex gap-1">
                        {s.keys.map((k, j) => (
                          <kbd
                            key={j}
                            className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
