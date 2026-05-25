import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Minus,
  Save,
  Trash2,
  Plus as PlusIcon,
  AlertCircle,
  LogIn,
  RefreshCw,
} from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth/store'
import { useInventory } from '@/features/inventory/store'
import {
  fetchLayout,
  saveLayout,
  type LayoutAisle,
  type LayoutBay,
  type LayoutDoc,
} from '@/lib/api'
import { cn } from '@/lib/cn'

/**
 * /settings/layout — minimal layout editor for the warehouse structure.
 * Lets a signed-in user add/remove aisles and bump bay counts. The richer
 * geometry (levels per bay × slots per level) is global and inferred from
 * the snapshot; only the per-aisle bay count is edited here.
 *
 * Saves the full nested aisle/bay/lane/slot structure to /api/layout
 * (matching the legacy SPA contract so the API doesn't need to change).
 */
export function LayoutEditor() {
  const user = useAuth((s) => s.user)
  const inv = useInventory((s) => s.inventory)
  const refreshInv = useInventory((s) => s.refresh)

  const levelCount = inv?.levels ?? 7
  const slotCount = inv?.slots ?? 7

  const [aisles, setAisles] = useState<EditableAisle[] | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // Load existing layout (or build a stub from the snapshot if no layout
  // doc has ever been saved).
  useEffect(() => {
    setLoading(true)
    fetchLayout()
      .then((doc) => {
        const initial = doc?.aisles?.length
          ? docToEditable(doc.aisles)
          : inv
            ? snapshotToEditable(inv.aisleBays)
            : []
        setAisles(initial)
        setOriginal(JSON.stringify(initial))
        setLoading(false)
      })
      .catch((e) => {
        setErr((e as Error).message)
        setLoading(false)
      })
  }, [inv])

  const dirty = useMemo(
    () => aisles !== null && JSON.stringify(aisles) !== original,
    [aisles, original],
  )

  if (!user) {
    return (
      <Card>
        <CardBody>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand/15 text-brand">
              <LogIn className="h-5 w-5" />
            </span>
            <div className="text-base font-semibold text-ink">Sign in to edit the layout</div>
            <p className="max-w-sm text-sm text-muted">
              Layout edits are persisted to the warehouse-wide configuration. Tap
              "Sign in" in the topbar to continue.
            </p>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (loading || !aisles) {
    return (
      <Card>
        <CardBody>
          <div className="h-32 animate-pulse rounded-lg bg-surface-2" />
        </CardBody>
      </Card>
    )
  }

  const totalBays = aisles.reduce((s, a) => s + a.bayCount, 0)

  async function handleSave() {
    if (!aisles) return
    setSaving(true)
    setErr(null)
    try {
      const doc: LayoutDoc = {
        aisles: aisles.map((a) => expandAisle(a, levelCount, slotCount)),
        dataVersion: inv?.generatedAt || '',
      }
      await saveLayout(doc)
      setOriginal(JSON.stringify(aisles))
      setSavedAt(Date.now())
      await refreshInv()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function addAisle() {
    const nextNum =
      Math.max(0, ...aisles!.map((a) => parseInt(a.id.slice(1), 10) || 0)) + 1
    setAisles([
      ...aisles!,
      {
        id: `A${String(nextNum).padStart(2, '0')}`,
        name: '',
        zone: 'Pick racking',
        bayCount: 1,
      },
    ])
  }

  function removeAisle(idx: number) {
    setAisles(aisles!.filter((_, i) => i !== idx))
  }

  function patchAisle(idx: number, patch: Partial<EditableAisle>) {
    setAisles(aisles!.map((a, i) => (i === idx ? { ...a, ...patch } : a)))
  }

  function bumpBays(idx: number, delta: number) {
    const a = aisles![idx]
    patchAisle(idx, { bayCount: Math.max(0, Math.min(99, a.bayCount + delta)) })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Warehouse OS"
          title="Layout editor"
          action={
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-muted sm:inline">
                {aisles.length} aisles · {totalBays} bays
              </span>
              {savedAt && !dirty && (
                <span className="text-[11px] text-good">Saved</span>
              )}
              <Button
                variant="primary"
                size="md"
                onClick={handleSave}
                disabled={!dirty || saving}
                icon={<Save className={cn('h-4 w-4', saving && 'animate-spin')} />}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          }
        />
        <CardBody className="space-y-3">
          {err && (
            <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <ul className="space-y-2">
            {aisles.map((a, idx) => (
              <li
                key={`${a.id}-${idx}`}
                className="rounded-lg border border-line bg-surface-2/40 p-3"
              >
                {/* Mobile: stack — header row with badge + name + delete,
                    then a "bays" row with stepper + label. Desktop:
                    single row with badge + name + zone + stepper + delete. */}
                <div className="flex items-center gap-3 sm:grid sm:grid-cols-[auto_1fr_1fr_auto_auto]">
                  <span className="grid h-10 w-12 flex-shrink-0 place-items-center rounded-md bg-brand/15 font-mono text-sm font-bold text-brand">
                    {a.id}
                  </span>
                  <input
                    value={a.name}
                    onChange={(e) => patchAisle(idx, { name: e.target.value })}
                    placeholder="Name (optional)"
                    className="h-10 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
                  />
                  <input
                    value={a.zone}
                    onChange={(e) => patchAisle(idx, { zone: e.target.value })}
                    placeholder="Zone"
                    className="hidden h-10 min-w-0 rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30 sm:block"
                  />
                  {/* Bay stepper — second row on mobile, inline on desktop */}
                  <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => bumpBays(idx, -1)}
                      aria-label="Fewer bays"
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="tnum min-w-[2.5rem] text-center text-sm font-bold text-ink">
                      {a.bayCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => bumpBays(idx, 1)}
                      aria-label="More bays"
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAisle(idx)}
                    aria-label={`Remove ${a.id}`}
                    className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md text-bad hover:bg-bad/15"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {/* Mobile-only bay stepper row */}
                <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Bays
                  </span>
                  <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => bumpBays(idx, -1)}
                      aria-label="Fewer bays"
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="tnum min-w-[2.5rem] text-center text-sm font-bold text-ink">
                      {a.bayCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => bumpBays(idx, 1)}
                      aria-label="More bays"
                      className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={addAisle}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-surface-2/20 px-3 py-3 text-sm font-semibold text-muted transition hover:border-brand-ring/40 hover:text-ink"
              >
                <PlusIcon className="h-4 w-4" />
                Add aisle
              </button>
            </li>
          </ul>

          {dirty && (
            <div className="flex items-center justify-between rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
              <span>Unsaved changes.</span>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Discard layout changes?')) {
                    setAisles(JSON.parse(original) as EditableAisle[])
                    setErr(null)
                  }
                }}
                className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                Revert
              </button>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Notes" title="How saving works" />
        <CardBody>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              • Aisle IDs are sticky once created — keep them stable across edits
              so historical stock data resolves cleanly.
            </li>
            <li>
              • Bay-count changes apply on next sync. Removed bays orphan any
              stock still in them; consider walking the aisle first.
            </li>
            <li>
              • Slot + level counts are warehouse-wide ({levelCount} levels ×{' '}
              {slotCount} slots). Editing those is a global change and lives in
              the WMS config, not here.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

interface EditableAisle {
  id: string
  name: string
  zone: string
  bayCount: number
}

function docToEditable(arr: LayoutAisle[]): EditableAisle[] {
  return arr.map((a) => ({
    id: a.id,
    name: a.name || '',
    zone: a.zone || 'Pick racking',
    bayCount: a.bays?.length || 0,
  }))
}

function snapshotToEditable(aisleBays: Record<string, number>): EditableAisle[] {
  return Object.keys(aisleBays)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => ({
      id: `A${String(n).padStart(2, '0')}`,
      name: '',
      zone: 'Pick racking',
      bayCount: aisleBays[String(n)] || 0,
    }))
}

/** Build the legacy nested shape expected by /api/layout — aisle → bays →
 *  lanes (levels) → slots — out of the user-edited spec. */
function expandAisle(
  a: EditableAisle,
  levelCount: number,
  slotCount: number,
): LayoutAisle {
  const bays: LayoutBay[] = Array.from({ length: a.bayCount }, (_, i) => {
    const num = i + 1
    return {
      id: `B${String(num).padStart(2, '0')}`,
      side: num % 2 === 1 ? 'left' : 'right',
      lanes: Array.from({ length: levelCount }, (_, j) => ({
        id: `L${String(j + 1).padStart(2, '0')}`,
        slots: Array.from({ length: slotCount }, (_, k) => ({
          id: `S${k + 1}`,
        })),
      })),
    }
  })
  return { id: a.id, name: a.name, zone: a.zone, bays }
}
