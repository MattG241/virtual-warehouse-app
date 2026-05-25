import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Boxes } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useInventory } from '@/features/inventory/store'
import { perAisle, fmtN, fmtPct } from '@/lib/inventory'
import { cn } from '@/lib/cn'

/** /warehouse — list every aisle with fullness bar. Tap to walk it. */
export function Warehouse() {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const aisles = useMemo(() => (inv ? perAisle(inv) : []), [inv])

  // ?aisle=A03 → bounce straight into that aisle (from search overlay)
  const jumpTo = params.get('aisle')
  if (jumpTo && aisles.some((a) => a.aisle === jumpTo)) {
    navigate(`/warehouse/${jumpTo}`, { replace: true })
    return null
  }

  if (!inv) return null

  return (
    <Card>
      <CardHeader eyebrow="Walk the floor" title="Aisles" />
      <CardBody>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {aisles.map((a) => {
            const pct = a.total ? Math.round((a.stocked / a.total) * 100) : 0
            const tone =
              pct >= 60 ? 'good' : pct >= 35 ? 'warn' : pct === 0 ? 'subtle' : 'bad'
            return (
              <li key={a.aisle}>
                <button
                  type="button"
                  onClick={() => navigate(`/warehouse/${a.aisle}`)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface-2/40 p-4 text-left transition hover:border-brand-ring/40 hover:bg-surface-2"
                >
                  <div className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-lg bg-brand/15 text-brand">
                    <Boxes className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-lg font-bold text-ink">
                        {a.aisle}
                      </span>
                      <span
                        className={cn(
                          'tnum rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          tone === 'good' && 'bg-good/15 text-good',
                          tone === 'warn' && 'bg-warn/15 text-warn',
                          tone === 'bad' && 'bg-bad/15 text-bad',
                          tone === 'subtle' && 'bg-surface-3 text-subtle',
                        )}
                      >
                        {fmtPct(pct)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          tone === 'good' && 'bg-good',
                          tone === 'warn' && 'bg-warn',
                          tone === 'bad' && 'bg-bad',
                          tone === 'subtle' && 'bg-subtle/30',
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                      <span>{fmtN(a.totalUnits)} units</span>
                      <span>{a.lowCount > 0 ? `${a.lowCount} low` : 'no low stock'}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                </button>
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}
