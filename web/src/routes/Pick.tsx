import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Route as RouteIcon, MapPin, Check, X, Plus, ListChecks, AlertCircle,
  ArrowRight, Play, Eraser, Trash2,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useInventory } from '@/features/inventory/store'
import { buildPickPlan, type PickRequest } from '@/lib/picker'
import { fmtN } from '@/lib/inventory'
import { cn } from '@/lib/cn'

/**
 * /pick — picker walk-through. Paste or enter a list of SKUs (with
 * optional qty), get back an optimised stop list ordered by aisle/bay/
 * level/slot. Each stop shows where to go, what to take, and the
 * walking direction. "Mark done" toggles each stop so the picker can
 * tick them off live.
 */
export function Pick() {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()

  const [draft, setDraft] = useState<string>('') // raw textarea content
  const [requests, setRequests] = useState<PickRequest[]>([])
  const [done, setDone] = useState<Set<number>>(new Set())

  const plan = useMemo(
    () => (inv && requests.length > 0 ? buildPickPlan(inv, requests) : null),
    [inv, requests],
  )

  function applyDraft() {
    const parsed = parseDraft(draft)
    setRequests(parsed)
    setDone(new Set())
  }

  function clear() {
    setDraft('')
    setRequests([])
    setDone(new Set())
  }

  if (!inv) return null

  // Two modes: pick-list editor when no requests yet, route view after
  if (!plan) {
    return (
      <DraftEditor
        draft={draft}
        setDraft={setDraft}
        onApply={applyDraft}
        onClear={clear}
      />
    )
  }

  const totalUnits = plan.stops.reduce((s, st) => s + st.pickQty, 0)
  const completedUnits = plan.stops
    .filter((s) => done.has(s.step))
    .reduce((s, st) => s + st.pickQty, 0)

  return (
    <div className="space-y-4">
      {/* Header summary + restart */}
      <Card>
        <CardBody className="!py-4 flex items-center gap-3">
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
            <RouteIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Pick route
            </div>
            <div className="text-base font-bold text-ink">
              {plan.stops.length} stop{plan.stops.length === 1 ? '' : 's'} ·{' '}
              {fmtN(totalUnits)} unit{totalUnits === 1 ? '' : 's'}
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              {fmtN(completedUnits)} picked of {fmtN(totalUnits)}
            </div>
          </div>
          <Button
            variant="ghost"
            size="md"
            onClick={clear}
            icon={<Eraser className="h-4 w-4" />}
            title="Start over"
          >
            <span className="hidden sm:inline">Reset</span>
          </Button>
        </CardBody>
        {/* Progress bar */}
        <div className="h-1 w-full bg-surface-2">
          <div
            className="h-full bg-brand transition-all"
            style={{
              width: `${totalUnits ? (completedUnits / totalUnits) * 100 : 0}%`,
            }}
          />
        </div>
      </Card>

      {/* Aisle path strip */}
      {plan.aisleSequence.length > 0 && (
        <Card>
          <CardHeader eyebrow="Walk path" title={`${plan.aisleSequence.length} aisles`} />
          <CardBody className="!pt-2">
            <ol className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {plan.aisleSequence.map((a, i) => {
                const next = plan.aisleSequence[i + 1]
                return (
                  <li key={a} className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => navigate(`/warehouse/${a}`)}
                      className="rounded-lg border border-brand-ring/30 bg-brand/15 px-3 py-1.5 font-mono text-xs font-bold text-brand"
                    >
                      {a}
                    </button>
                    {next && <ArrowRight className="h-3.5 w-3.5 text-subtle" />}
                  </li>
                )
              })}
            </ol>
          </CardBody>
        </Card>
      )}

      {/* Unfulfilled list */}
      {plan.unfulfilled.length > 0 && (
        <Card>
          <CardHeader
            eyebrow="Out of stock"
            title={`${plan.unfulfilled.length} SKU${plan.unfulfilled.length === 1 ? '' : 's'} unavailable`}
          />
          <CardBody className="!p-0">
            <ul className="divide-y divide-line">
              {plan.unfulfilled.map((u) => (
                <li
                  key={u.sku}
                  className="flex items-center gap-3 px-5 py-3 text-sm"
                >
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-bad/15 text-bad">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm font-semibold text-ink">
                      {u.sku}
                    </div>
                    <div className="text-[11px] text-muted">
                      {fmtN(u.qty)} unit{u.qty === 1 ? '' : 's'} requested · no source
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Stops */}
      <Card>
        <CardHeader
          eyebrow="Walk order"
          title="Stops"
          action={
            <span className="text-[11px] text-muted">
              {plan.stops.length - done.size} remaining
            </span>
          }
        />
        <CardBody className="!p-0">
          <ul className="divide-y divide-line">
            {plan.stops.map((s) => {
              const isDone = done.has(s.step)
              const skuMeta = inv.skus[s.request.sku]
              return (
                <li
                  key={`${s.step}-${s.slot.code}`}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 transition',
                    isDone && 'opacity-60',
                  )}
                >
                  {/* Step badge */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = new Set(done)
                      if (isDone) next.delete(s.step)
                      else next.add(s.step)
                      setDone(next)
                    }}
                    aria-label={isDone ? 'Mark not picked' : 'Mark picked'}
                    className={cn(
                      'mt-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border font-mono text-xs font-bold transition',
                      isDone
                        ? 'border-good bg-good text-white'
                        : 'border-line bg-surface text-muted hover:border-brand-ring hover:text-brand',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : s.step}
                  </button>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {s.newAisle && (
                      <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
                        <MapPin className="h-3 w-3" />
                        Enter aisle {s.aisle}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(
                          `/warehouse/${s.aisle}?slot=${encodeURIComponent(s.slot.code)}`,
                        )
                      }
                      className={cn(
                        'block w-full text-left text-base font-bold text-ink',
                        isDone && 'line-through',
                      )}
                    >
                      <span className="font-mono">{s.slot.code}</span>
                    </button>
                    <div className="mt-0.5 text-[11px] text-muted">
                      <span className="font-mono">{s.request.sku}</span>
                      {skuMeta?.[0] && <> · {skuMeta[0]}</>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                      <span className="tnum inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-0.5 font-semibold text-good">
                        Take {fmtN(s.pickQty)}
                      </span>
                      {s.remaining > 0 && (
                        <span className="text-warn">
                          ({fmtN(s.remaining)} still needed elsewhere)
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </CardBody>
      </Card>

      {/* Finish CTA */}
      {done.size === plan.stops.length && plan.stops.length > 0 && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-good/15 text-good">
                <Check className="h-6 w-6" />
              </span>
              <div className="text-base font-semibold text-ink">All picked</div>
              <p className="max-w-sm text-sm text-muted">
                Walked {plan.aisleSequence.length} aisle
                {plan.aisleSequence.length === 1 ? '' : 's'}, picked{' '}
                {fmtN(totalUnits)} unit{totalUnits === 1 ? '' : 's'}.
              </p>
              <Button variant="primary" size="md" onClick={clear}>
                Start another pick
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}

/** Step 1: paste / type the SKU list. */
function DraftEditor({
  draft,
  setDraft,
  onApply,
  onClear,
}: {
  draft: string
  setDraft: (s: string) => void
  onApply: () => void
  onClear: () => void
}) {
  const lines = useMemo(() => parseDraft(draft), [draft])
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Pick list"
          title="What are you picking?"
          action={
            draft && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear"
                className="grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )
          }
        />
        <CardBody className="space-y-3">
          <p className="text-sm text-muted">
            Paste a list — one SKU per line. Add a quantity after a space or comma
            (defaults to 1).
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`ANISBR-LBK-XS 2\nASPSHO-OLV-M, 5\nSCULEG-BLK-S`}
            rows={8}
            className="min-h-[160px] w-full rounded-lg border border-line bg-surface p-3 font-mono text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-muted">
              {lines.length} line{lines.length === 1 ? '' : 's'} parsed
            </span>
            <Button
              variant="primary"
              size="md"
              onClick={onApply}
              disabled={lines.length === 0}
              icon={<Play className="h-4 w-4" />}
            >
              Build route
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Helper card */}
      <Card>
        <CardHeader eyebrow="Tips" title="How it works" />
        <CardBody>
          <ol className="space-y-2 text-sm text-muted">
            <li className="flex items-start gap-2">
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                1
              </span>
              <span>
                <strong className="text-ink">Drop in your list.</strong> One SKU
                per line; quantity is optional.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                2
              </span>
              <span>
                <strong className="text-ink">Build route.</strong> The optimiser
                picks the fullest source for each SKU and orders stops by
                aisle/bay so you walk in one direction.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-brand/15 text-[10px] font-bold text-brand">
                3
              </span>
              <span>
                <strong className="text-ink">Walk &amp; tick.</strong> Tap each
                step's number to mark it picked. The progress bar tracks
                completion. Tap a slot to jump into the warehouse view if
                you need to inspect the bay first.
              </span>
            </li>
          </ol>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2/40 p-3 text-[11px] text-muted">
            <ListChecks className="h-4 w-4 flex-shrink-0 text-brand" />
            <span>
              SKUs with no available source surface in a separate "Out of stock"
              card so you can act on them after the pick.
            </span>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

/** Parse free-text pick list into structured requests. Accepts:
 *    SKU
 *    SKU 5
 *    SKU,5
 *    SKU 5 (any trailing notes get ignored)
 *  Empty/whitespace lines skipped.
 */
function parseDraft(s: string): PickRequest[] {
  const out: PickRequest[] = []
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const m = /^([A-Z0-9._-]+)[\s,]+(\d+)/i.exec(line) || /^([A-Z0-9._-]+)$/i.exec(line)
    if (!m) continue
    const sku = m[1].toUpperCase()
    const qty = m[2] ? parseInt(m[2], 10) : 1
    if (sku) out.push({ sku, qty: Math.max(1, qty) })
  }
  return out
}

// Marker so unused-imports lint passes
void Plus
void X
