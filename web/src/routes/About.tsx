import { Link } from 'react-router-dom'
import {
  Package, GitCommit, Calendar, Globe, Keyboard, ExternalLink, ChevronRight,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { useInventory } from '@/features/inventory/store'
import { fmtN } from '@/lib/inventory'

/**
 * /about — version + build info + quick links + at-a-glance stats.
 * Lives in the More sheet on mobile, sidebar on desktop.
 */
export function About() {
  const inv = useInventory((s) => s.inventory)

  const sha = typeof __APP_BUILD_SHA__ === 'string' ? __APP_BUILD_SHA__ : 'unknown'
  const buildTime =
    typeof __APP_BUILD_TIME__ === 'string' ? __APP_BUILD_TIME__ : 'unknown'

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-2xl bg-brand-grad shadow-glow">
              <img
                src="/ryderwear-mark.png"
                alt=""
                aria-hidden
                className="h-10 w-10 object-contain"
                draggable={false}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">
                Ryderwear · Virtual Warehouse OS
              </div>
              <h2 className="text-xl font-bold text-ink">Live stock control</h2>
              <p className="mt-1 text-sm text-muted">
                Drag-down inventory, replenishment routing, picker walk-throughs,
                live alerts. Fed by Peoplevox WMS.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Build" title="This deployment" />
        <CardBody className="!p-0">
          <ul className="divide-y divide-line">
            <li className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-brand/15 text-brand">
                <GitCommit className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Commit
                </div>
                <div className="truncate font-mono text-sm font-semibold text-ink">
                  {sha}
                </div>
              </div>
            </li>
            <li className="flex items-center gap-3 px-5 py-3">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-good/15 text-good">
                <Calendar className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted">
                  Built
                </div>
                <div className="truncate font-mono text-sm font-semibold text-ink">
                  {buildTime}
                </div>
              </div>
            </li>
            {inv && (
              <li className="flex items-center gap-3 px-5 py-3">
                <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-warn/15 text-warn">
                  <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted">
                    Snapshot
                  </div>
                  <div className="text-sm font-semibold text-ink">
                    {fmtN(inv.rowCount)} stock rows · {fmtN(Object.keys(inv.skus).length)}{' '}
                    SKUs
                  </div>
                </div>
              </li>
            )}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Quick links" title="Jump to" />
        <CardBody className="!p-0">
          <ul className="divide-y divide-line">
            <LinkRow to="/scan" icon={<Globe className="h-4 w-4" />} label="Scan a barcode" hint="Camera or wired" />
            <LinkRow to="/pick" icon={<Keyboard className="h-4 w-4" />} label="Build a pick route" hint="Paste a SKU list and walk it" />
            <LinkRow to="/replenish" icon={<Package className="h-4 w-4" />} label="Replenish or put-away" hint="Find low boxes + empty slots" />
            <LinkRow to="/settings" icon={<ExternalLink className="h-4 w-4" />} label="Settings &amp; layout editor" hint="Customise the app and warehouse" />
          </ul>
        </CardBody>
      </Card>

      <p className="text-center text-[11px] text-subtle">
        © Ryderwear · Built with React + Vite · Live data via Peoplevox
      </p>
    </div>
  )
}

function LinkRow({
  to, icon, label, hint,
}: { to: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-surface-2 text-brand">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{label}</div>
          <div className="text-[11px] text-muted">{hint}</div>
        </div>
        <ChevronRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
      </Link>
    </li>
  )
}
