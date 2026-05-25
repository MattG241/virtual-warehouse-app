import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Sparkles } from 'lucide-react'

interface Props {
  title: string
  body?: string
}

// Used for routes whose UI hasn't been built yet — keeps nav coherent so
// the shell + theme story doesn't have dead links during the phase rollout.
export function Placeholder({ title, body }: Props) {
  return (
    <Card>
      <CardHeader eyebrow="Coming soon" title={title} />
      <CardBody>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand/15 text-brand">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="max-w-md text-sm text-muted">
            {body ||
              `This view is part of the UI overhaul — coming in the next phase. The
              underlying data is already available, only the screen is missing.`}
          </p>
        </div>
      </CardBody>
    </Card>
  )
}
