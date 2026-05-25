import { Link } from 'react-router-dom'
import { Compass, ArrowLeft } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'

export function NotFound() {
  return (
    <Card>
      <CardBody>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand/15 text-brand">
            <Compass className="h-6 w-6" />
          </span>
          <h2 className="text-2xl font-bold text-ink">Page not found</h2>
          <p className="max-w-md text-sm text-muted">
            That route doesn't exist. Try the command centre or use the search overlay.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-line-strong"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Command Centre
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}
