import { X } from 'lucide-react'
import type { SlotSummary } from '@/lib/types'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusPill } from '@/components/ui/StatusPill'
import { fmtN } from '@/lib/inventory'
import { cn } from '@/lib/cn'

interface Props {
  slot: SlotSummary | null
  onClose?: () => void
  asPanel?: boolean
}

export function SlotDetail({ slot, onClose, asPanel }: Props) {
  if (!slot) {
    return (
      <Card>
        <CardHeader eyebrow="Inspector" title="Tap a box" />
        <CardBody>
          <p className="text-sm text-muted">
            Tap any box in the rack to inspect its SKUs and stock levels.
          </p>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className={cn(asPanel && 'sticky top-20')}>
      <CardHeader
        eyebrow="Selected"
        title={
          <span className="font-mono">{slot.code}</span>
        }
        action={
          onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null
        }
      />
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <StatusPill status={slot.status} />
          <div className="text-right">
            <div className="tnum text-2xl font-bold text-ink">
              {fmtN(slot.totalUnits)}
            </div>
            <div className="text-xs text-muted">units in box</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <Meta label="Aisle" value={slot.aisle} />
          <Meta label="Bay" value={slot.bay} />
          <Meta label="Level" value={slot.level} />
          <Meta label="Slot" value={slot.slot} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted">
            <span>SKUs ({slot.skus.length})</span>
            <span>Units</span>
          </div>
          {slot.skus.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-surface-2/40 p-4 text-center text-sm text-muted">
              Empty box — available to replenish.
            </div>
          ) : (
            <ul className="divide-y divide-line/60 rounded-lg border border-line bg-surface-2/40">
              {slot.skus.map((s) => (
                <li key={s.sku} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-semibold text-ink">
                      {s.sku}
                    </div>
                    {s.name && (
                      <div className="truncate text-[11px] text-muted">{s.name}</div>
                    )}
                  </div>
                  <div className="tnum text-sm font-semibold text-ink">
                    {fmtN(s.qty)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold text-ink">{value}</div>
    </div>
  )
}
