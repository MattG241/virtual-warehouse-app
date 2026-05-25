// CSS-rendered warehouse rack. Each rack = one bay = N levels × M slots.
//
// Styled to evoke the reference photo: orange steel uprights, dark teal
// beams across the front of each shelf, kraft-brown boxes with a white
// label patch carrying the location code. Stock state tints the box —
// dark/empty (outlined) → muted → healthy brown.

import { memo } from 'react'
import { cn } from '@/lib/cn'
import type { SlotSummary } from '@/lib/types'
import { fmtN } from '@/lib/inventory'

interface BayShape {
  bay: string // B01
  levels: { level: string; slots: SlotSummary[] }[]
}

interface RackProps {
  bay: BayShape
  selectedCode?: string
  onSelect?: (slot: SlotSummary) => void
  compact?: boolean
}

export const Rack = memo(function Rack({
  bay,
  selectedCode,
  onSelect,
  compact,
}: RackProps) {
  return (
    <div
      className={cn(
        'rack relative isolate inline-flex flex-col gap-0 select-none',
        compact ? 'px-2 pt-2 pb-3' : 'px-3 pt-3 pb-4',
      )}
      data-bay={bay.bay}
    >
      {/* Floor shadow */}
      <div
        className="absolute -bottom-1 left-3 right-3 h-2 rounded-full bg-black/40 blur-md"
        aria-hidden
      />

      {/* Top label plate */}
      <div className="z-10 mb-1 self-center rounded-md bg-[#0f4255] px-3 py-1 font-mono text-[11px] font-bold tracking-wide text-white shadow-sm ring-1 ring-black/30">
        {bay.bay}
      </div>

      {/* Rack frame */}
      <div className="relative flex flex-col rounded-sm bg-gradient-to-b from-[#2a3344] to-[#1c2230] ring-1 ring-black/40 shadow-[0_8px_24px_-6px_rgb(0_0_0_/_0.5)]">
        {/* Left/right orange uprights */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-2 rounded-l-sm bg-gradient-to-b from-[#e8772b] via-[#d4641b] to-[#a84813]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-2 rounded-r-sm bg-gradient-to-b from-[#e8772b] via-[#d4641b] to-[#a84813]"
          aria-hidden
        />

        <div className="flex flex-col gap-0 px-2 py-1">
          {bay.levels.map((lv, idx) => (
            <Shelf
              key={lv.level}
              level={lv.level}
              slots={lv.slots}
              isLast={idx === bay.levels.length - 1}
              compact={compact}
              selectedCode={selectedCode}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  )
})

interface ShelfProps {
  level: string
  slots: SlotSummary[]
  isLast: boolean
  compact?: boolean
  selectedCode?: string
  onSelect?: (slot: SlotSummary) => void
}

function Shelf({ level, slots, isLast, compact, selectedCode, onSelect }: ShelfProps) {
  return (
    <div className="relative">
      {/* Boxes row */}
      <div
        className={cn(
          'flex items-end gap-[2px]',
          compact ? 'min-h-[44px]' : 'min-h-[58px]',
        )}
      >
        {slots.map((slot) => (
          <Box
            key={slot.code}
            slot={slot}
            compact={compact}
            selected={slot.code === selectedCode}
            onSelect={() => onSelect?.(slot)}
          />
        ))}
      </div>
      {/* Shelf cross-beam */}
      {!isLast && (
        <div
          className="relative my-[1px] h-[5px] rounded-[1px] bg-gradient-to-b from-[#13556d] via-[#0d4154] to-[#082f3e] shadow-[inset_0_-1px_0_rgba(0,0,0,0.5)]"
          aria-hidden
        >
          <span className="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[8px] font-bold uppercase text-white/40">
            {level}
          </span>
        </div>
      )}
    </div>
  )
}

interface BoxProps {
  slot: SlotSummary
  compact?: boolean
  selected?: boolean
  onSelect?: () => void
}

function Box({ slot, compact, selected, onSelect }: BoxProps) {
  const isEmpty = slot.status === 'empty'
  const isLow = slot.status === 'low'

  return (
    <button
      type="button"
      onClick={onSelect}
      data-code={slot.code}
      aria-label={`${slot.code} — ${slot.status}, ${fmtN(slot.totalUnits)} units`}
      title={`${slot.code} · ${fmtN(slot.totalUnits)} units`}
      className={cn(
        'group relative flex-1 cursor-pointer overflow-hidden rounded-[3px] border-b-[2px] outline-none transition-transform',
        compact ? 'h-9 min-w-[26px]' : 'h-12 min-w-[34px]',
        // Visual states
        isEmpty
          ? 'border border-dashed border-white/15 bg-black/20'
          : isLow
            ? 'border-[#7a4d1d] bg-gradient-to-b from-[#c79870] via-[#a87340] to-[#754d24] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
            : 'border-[#5b3a1a] bg-gradient-to-b from-[#c79059] via-[#9d6635] to-[#6b4422] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]',
        'hover:z-10 hover:-translate-y-[1px] hover:shadow-[0_4px_10px_-2px_rgb(0_0_0_/_0.5)]',
        selected &&
          'z-20 ring-2 ring-brand outline-offset-1 shadow-[0_0_0_2px_rgb(var(--brand)),0_8px_18px_-4px_rgb(var(--brand)/0.6)]',
      )}
    >
      {/* Vertical box flap line (visual realism) */}
      {!isEmpty && (
        <span
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-black/15"
          aria-hidden
        />
      )}
      {/* Status indicator dot for low */}
      {isLow && (
        <span
          className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warn ring-1 ring-black/40"
          aria-hidden
        />
      )}
      {/* White label patch with location code */}
      {!isEmpty && (
        <span
          className={cn(
            'pointer-events-none absolute left-1/2 top-[3px] flex -translate-x-1/2 items-center justify-center rounded-[1px] bg-white/95 text-[7px] font-bold leading-none text-black/80 ring-1 ring-black/10',
            compact ? 'h-3 w-[80%] text-[6.5px]' : 'h-3.5 w-[80%] text-[7px]',
          )}
        >
          {slot.slot}
        </span>
      )}
    </button>
  )
}
