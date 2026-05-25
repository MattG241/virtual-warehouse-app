import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useInventory } from '@/features/inventory/store'
import { fmtN } from '@/lib/inventory'
import { Rack } from '@/features/warehouse/Rack'
import { baysForAisle } from '@/features/warehouse/buildBays'
import { SlotDetail } from '@/features/warehouse/SlotDetail'
import type { SlotSummary } from '@/lib/types'
import { cn } from '@/lib/cn'

/** /warehouse/:aisleId — horizontally-scrollable walk of every bay in the
 *  aisle. Tap a bay to focus, tap any box for details in the side panel
 *  (or full-screen sheet on mobile). */
export function AisleView() {
  const { aisleId = '' } = useParams<{ aisleId: string }>()
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()

  const bays = useMemo(
    () => (inv ? baysForAisle(inv, aisleId.toUpperCase()) : []),
    [inv, aisleId],
  )
  const [selected, setSelected] = useState<SlotSummary | null>(null)
  const [activeBay, setActiveBay] = useState<string>(bays[0]?.bay || '')

  // Reset selection when navigating between aisles
  useEffect(() => {
    setSelected(null)
    setActiveBay(bays[0]?.bay || '')
  }, [aisleId, bays])

  if (!inv) return null
  if (!bays.length) {
    return (
      <Card>
        <CardHeader eyebrow="Not found" title={aisleId} />
        <CardBody>
          <p className="text-sm text-muted">
            No bays in {aisleId}. Check the{' '}
            <Link to="/warehouse" className="text-brand underline">
              aisle list
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    )
  }

  const totalUnits = bays.reduce(
    (s, b) => s + b.levels.reduce((s2, l) => s2 + l.slots.reduce((s3, x) => s3 + x.totalUnits, 0), 0),
    0,
  )

  return (
    <div className="space-y-4">
      {/* Breadcrumb + summary */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/warehouse')}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
          aria-label="Back to aisles"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Walk-through
          </div>
          <h2 className="font-mono text-xl font-bold text-ink">{aisleId}</h2>
        </div>
        <div className="ml-auto rounded-lg bg-surface-2 px-3 py-1.5 text-right">
          <div className="text-[10px] uppercase tracking-wider text-muted">Total stock</div>
          <div className="tnum text-base font-bold text-ink">{fmtN(totalUnits)}</div>
        </div>
      </div>

      {/* Bay strip — sticky horizontal scroll chip nav */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2">
          {bays.map((b) => (
            <button
              key={b.bay}
              type="button"
              onClick={() => {
                setActiveBay(b.bay)
                const el = document.querySelector<HTMLElement>(`[data-bay="${b.bay}"]`)
                el?.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' })
              }}
              className={cn(
                'flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition',
                b.bay === activeBay
                  ? 'border-brand-ring/50 bg-brand/15 text-brand'
                  : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {b.bay}
            </button>
          ))}
        </div>
      </div>

      {/* Rack walkthrough — horizontally scrollable strip */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden p-0">
          <div
            className="warehouse-floor relative overflow-x-auto overflow-y-hidden"
            role="region"
            aria-label="Warehouse rack walkthrough"
          >
            <div className="floor-grid pointer-events-none absolute inset-x-0 bottom-0 h-12" aria-hidden />
            <div className="flex items-end gap-6 px-6 py-8">
              {bays.map((bay) => (
                <Rack
                  key={bay.bay}
                  bay={bay}
                  selectedCode={selected?.code}
                  onSelect={setSelected}
                />
              ))}
              {/* trailing spacer so the last rack can scroll fully into view */}
              <div className="w-6 flex-shrink-0" aria-hidden />
            </div>
            {/* Scroll affordance */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-bg/80 to-transparent" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface/40 px-4 py-2 text-[11px] text-muted">
            <span>Scroll horizontally · tap any box to inspect</span>
            <span className="hidden sm:inline">{bays.length} bays</span>
          </div>
        </Card>

        {/* Desktop inspector — sticky on the right */}
        <div className="hidden lg:block">
          {selected ? (
            <SlotDetail slot={selected} asPanel onClose={() => setSelected(null)} />
          ) : (
            <SlotDetail slot={null} />
          )}
        </div>
      </div>

      {/* Mobile bottom sheet for selected slot — covers tab bar with backdrop */}
      {selected && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-hidden
            onClick={() => setSelected(null)}
          />
          <div
            className="relative max-h-[80dvh] overflow-y-auto p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] animate-in slide-in-from-bottom-4 fade-in duration-200"
          >
            <SlotDetail slot={selected} onClose={() => setSelected(null)} />
          </div>
        </div>
      )}

      {/* Footer nav — prev/next aisle */}
      <NeighbourNav aisleId={aisleId} />
    </div>
  )
}

function NeighbourNav({ aisleId }: { aisleId: string }) {
  const inv = useInventory((s) => s.inventory)
  if (!inv) return null
  const aisles = Object.keys(inv.aisleBays)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `A${String(n).padStart(2, '0')}`)
  const idx = aisles.indexOf(aisleId)
  const prev = idx > 0 ? aisles[idx - 1] : null
  const next = idx >= 0 && idx < aisles.length - 1 ? aisles[idx + 1] : null

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      {prev ? (
        <Link
          to={`/warehouse/${prev}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted hover:border-line-strong hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> {prev}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={`/warehouse/${next}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-muted hover:border-line-strong hover:text-ink"
        >
          {next} <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

