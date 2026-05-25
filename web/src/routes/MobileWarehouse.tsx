// Mobile Warehouse — iOS-style list of aisles, one row per aisle with
// inline fullness bar + units + low count. Replaces the card grid the
// desktop version uses.

import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { ListGroup, ListRow } from '@/components/ui/ListGroup'
import { useInventory } from '@/features/inventory/store'
import { perAisle, fmtN, fmtPct } from '@/lib/inventory'
import { cn } from '@/lib/cn'

export function MobileWarehouse() {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const aisles = useMemo(() => (inv ? perAisle(inv) : []), [inv])

  const jumpTo = params.get('aisle')
  if (jumpTo && aisles.some((a) => a.aisle === jumpTo)) {
    navigate(`/warehouse/${jumpTo}`, { replace: true })
    return null
  }

  if (!inv) return null

  return (
    <ListGroup title="Walk the floor" footnote="Tap an aisle to see every rack inside it.">
      {aisles.map((a) => {
        const pct = a.total ? Math.round((a.stocked / a.total) * 100) : 0
        const tone =
          pct >= 60 ? 'good' : pct >= 35 ? 'warn' : pct === 0 ? 'subtle' : 'bad'
        return (
          <ListRow
            key={a.aisle}
            leading={
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/15 text-brand">
                <Boxes className="h-4 w-4" />
              </span>
            }
            title={
              <span className="flex items-center gap-2">
                <span className="font-mono">{a.aisle}</span>
                <span
                  className={cn(
                    'tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                    tone === 'good' && 'bg-good/15 text-good',
                    tone === 'warn' && 'bg-warn/15 text-warn',
                    tone === 'bad' && 'bg-bad/15 text-bad',
                    tone === 'subtle' && 'bg-surface-3 text-subtle',
                  )}
                >
                  {fmtPct(pct)}
                </span>
              </span>
            }
            subtitle={
              <span className="mt-1 inline-flex w-full max-w-[200px] items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      tone === 'good' && 'bg-good',
                      tone === 'warn' && 'bg-warn',
                      tone === 'bad' && 'bg-bad',
                      tone === 'subtle' && 'bg-subtle/30',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="text-[11px] text-muted">{fmtN(a.totalUnits)}u</span>
              </span>
            }
            trailing={
              a.lowCount > 0 ? (
                <span className="tnum text-warn">{a.lowCount} low</span>
              ) : null
            }
            chevron
            onClick={() => navigate(`/warehouse/${a.aisle}`)}
          />
        )
      })}
    </ListGroup>
  )
}
