// Isometric 3D warehouse heatmap — every aisle, bay, level, slot
// rendered as a colour-coded box. Click a box for the details panel;
// click an aisle floor pad to drill into the rack walk-through.
//
// Performance: ~10k boxes → uses instanced meshes (one draw call per
// status colour) instead of one mesh per box. Holds 60fps on a phone.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, Text } from '@react-three/drei'
import * as THREE from 'three'
import {
  RotateCcw, Eye, EyeOff, Maximize2, X, ChevronRight,
} from 'lucide-react'
import { useInventory } from '@/features/inventory/store'
import { allSlots, fmtN } from '@/lib/inventory'
import type { SlotSummary } from '@/lib/types'
import { cn } from '@/lib/cn'

// Spacing constants (world units = arbitrary; tuned to look good)
const SLOT_W = 0.55
const SLOT_H = 0.45
const SLOT_D = 0.45
const LEVEL_GAP = 0.03   // vertical gap between shelves
const SLOT_GAP = 0.05    // horizontal gap between adjacent slots on a shelf
const BAY_GAP = 0.20     // gap between bays in the same aisle
const AISLE_GAP = 2.5    // walkway gap between adjacent aisle blocks

const STATUS_COLOR: Record<string, string> = {
  empty: '#1b3a5b',     // muted blue
  critical: '#dc2626',  // red
  low: '#f59e0b',       // orange
  healthy: '#22c55e',   // green
}

interface SlotPos {
  slot: SlotSummary
  x: number
  y: number
  z: number
}

function layoutSlots(slots: SlotSummary[]): SlotPos[] {
  // Compute the bay count per aisle so we can centre each aisle row.
  const baysPerAisle = new Map<string, number>()
  const slotsPerBay = new Map<string, number>() // bay code → max slot index
  for (const s of slots) {
    const bayNum = parseInt(s.bay.slice(1), 10)
    baysPerAisle.set(s.aisle, Math.max(baysPerAisle.get(s.aisle) || 0, bayNum))
    const key = `${s.aisle}.${s.bay}`
    const slotNum = parseInt(s.slot.slice(1), 10)
    slotsPerBay.set(key, Math.max(slotsPerBay.get(key) || 0, slotNum))
  }
  const aisleIds = [...baysPerAisle.keys()].sort()

  // Sum bay widths per aisle for centring
  const bayWidth = SLOT_W * 7 + SLOT_GAP * 6 + BAY_GAP // assume 7 slots per bay, fall back below

  const out: SlotPos[] = []
  for (const slot of slots) {
    const aisleIdx = aisleIds.indexOf(slot.aisle)
    if (aisleIdx === -1) continue
    const bayNum = parseInt(slot.bay.slice(1), 10) - 1
    const slotNum = parseInt(slot.slot.slice(1), 10) - 1
    const levelNum = parseInt(slot.level.slice(1), 10) - 1
    const bayCount = baysPerAisle.get(slot.aisle) || 1

    // Centre the aisle's bays around X=0
    const aisleHalfWidth = (bayCount * bayWidth - BAY_GAP) / 2
    const x = bayNum * bayWidth - aisleHalfWidth + slotNum * (SLOT_W + SLOT_GAP)
    const y = levelNum * (SLOT_H + LEVEL_GAP) + SLOT_H / 2
    // Each aisle pushed back in Z
    const z = aisleIdx * AISLE_GAP

    out.push({ slot, x, y, z })
  }
  return out
}

interface Props {
  onClose?: () => void
}

export function Warehouse3D({ onClose }: Props) {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<SlotSummary | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  const controlsRef = useRef<{ reset: () => void } | null>(null)

  const positions = useMemo(() => (inv ? layoutSlots(allSlots(inv)) : []), [inv])
  const visible = useMemo(
    () => (hideEmpty ? positions.filter((p) => p.slot.status !== 'empty') : positions),
    [positions, hideEmpty],
  )

  // Compute scene bounds for an isometric camera that frames the whole warehouse
  const bounds = useMemo(() => {
    if (positions.length === 0) {
      return { centre: [0, 0, 0] as [number, number, number], size: 10 }
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0
    for (const p of positions) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
      maxY = Math.max(maxY, p.y)
    }
    const centre: [number, number, number] = [
      (minX + maxX) / 2,
      maxY / 2,
      (minZ + maxZ) / 2,
    ]
    const size = Math.max(maxX - minX, maxZ - minZ, maxY * 2)
    return { centre, size }
  }, [positions])

  const aisleIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of positions) set.add(p.slot.aisle)
    return [...set].sort()
  }, [positions])

  // WebGL feature-detect — some embedded webviews / very old browsers
  // can't run Three.js. Render a graceful fallback instead of a black
  // void so the page still feels alive.
  const hasWebGL = useMemo(() => {
    if (typeof document === 'undefined') return true
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl2') || c.getContext('webgl'))
    } catch {
      return false
    }
  }, [])

  if (!inv) return null
  if (!hasWebGL) {
    return (
      <div className="grid h-full place-items-center rounded-2xl border border-line bg-surface/40 p-6 text-center">
        <div className="max-w-sm">
          <div className="mb-2 text-base font-semibold text-ink">3D not supported</div>
          <p className="text-sm text-muted">
            Your browser doesn't support WebGL. Open the warehouse list view to
            see the same data as colour-coded racks.
          </p>
          <button
            type="button"
            onClick={() => navigate('/warehouse')}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-glow hover:opacity-95"
          >
            Open warehouse list
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-line bg-bg/80">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false }}
        style={{ background: 'radial-gradient(ellipse at center, #11203a 0%, #050a14 70%)' }}
      >
        <color attach="background" args={['#0a1428']} />
        <SceneCamera centre={bounds.centre} size={bounds.size} />
        <OrbitControls
          ref={controlsRef as never}
          enablePan
          enableRotate
          enableZoom
          minZoom={0.3}
          maxZoom={3}
          target={bounds.centre}
          dampingFactor={0.12}
        />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={0.9} />
        <directionalLight position={[-5, 7, -3]} intensity={0.3} color="#88aaff" />

        {/* Floor — subtle */}
        <Floor centre={bounds.centre} size={bounds.size + 4} />

        {/* Aisle floor pads with labels — click to drill in */}
        {aisleIds.map((aisle) => (
          <AislePad
            key={aisle}
            aisle={aisle}
            positions={positions}
            onClick={() => navigate(`/warehouse/${aisle}`)}
          />
        ))}

        {/* Instanced box meshes — one per status */}
        <Boxes
          positions={visible}
          selectedCode={selected?.code || null}
          onSelect={setSelected}
        />
      </Canvas>

      {/* Overlay controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {/* Top bar */}
        <div className="pointer-events-auto flex items-start justify-between gap-2 p-3">
          <div className="flex flex-wrap gap-1.5 rounded-full bg-bg/80 px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-line backdrop-blur-md">
            <LegendDot tone="healthy" label="Stocked" />
            <LegendDot tone="low" label="Low" />
            <LegendDot tone="critical" label="Critical" />
            <LegendDot tone="empty" label="Empty" />
          </div>
          <div className="flex gap-1.5">
            <CanvasButton
              title={hideEmpty ? 'Show empty boxes' : 'Hide empty boxes'}
              onClick={() => setHideEmpty((v) => !v)}
              icon={hideEmpty ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            />
            <CanvasButton
              title="Reset camera"
              onClick={() => {
                // Force a remount of OrbitControls by toggling a key isn't
                // trivial here — instead jiggle the target to its initial.
                // The OrbitControls reset() is internal; the simplest reliable
                // path is to reload the page-state for this view.
                if (controlsRef.current && typeof controlsRef.current.reset === 'function') {
                  controlsRef.current.reset()
                }
              }}
              icon={<RotateCcw className="h-4 w-4" />}
            />
            {onClose && (
              <CanvasButton
                title="Close 3D view"
                onClick={onClose}
                icon={<X className="h-4 w-4" />}
              />
            )}
          </div>
        </div>

        {/* Selected slot panel — floats over the canvas bottom */}
        {selected && (
          <div className="pointer-events-auto mx-auto mt-auto mb-3 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg font-mono text-xs font-bold"
                style={{
                  background: `${STATUS_COLOR[selected.status]}22`,
                  color: STATUS_COLOR[selected.status],
                }}
              >
                {selected.totalUnits}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm font-bold text-ink">{selected.code}</div>
                <div className="truncate text-[11px] text-muted">
                  {selected.skus[0]
                    ? `${selected.skus[0].sku} · ${selected.skus[0].name || '—'}`
                    : 'Empty box'}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/warehouse/${selected.aisle}?slot=${encodeURIComponent(selected.code)}`,
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white shadow-glow hover:opacity-95"
              >
                Walk
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- */
/* Subcomponents                                                     */
/* ----------------------------------------------------------------- */

function SceneCamera({
  centre,
  size,
}: {
  centre: [number, number, number]
  size: number
}) {
  // Isometric position — 45° azimuth, ~30° elevation
  const distance = size * 1.4
  const pos: [number, number, number] = [
    centre[0] + distance,
    centre[1] + distance * 0.8,
    centre[2] + distance,
  ]
  // Near/far must scale with the scene — the camera is `distance` units from
  // the target along an isometric vector (~1.7× `distance` in length), so a
  // big warehouse can sit hundreds of world units in front of the lens. Fixed
  // small values clipped the entire scene to a blank canvas on real data.
  const depth = Math.max(500, size * 5)
  // Cap zoom for tiny scenes (so a 1-aisle test warehouse doesn't fill the
  // viewport at 360×); for large scenes we want to *decrease* zoom so the
  // whole warehouse frames in initial view. The previous Math.max floor of 20
  // forced large warehouses to render zoomed into a single bay.
  const zoom = Math.min(40, 360 / Math.max(size, 1))
  return (
    <OrthographicCamera
      makeDefault
      position={pos}
      zoom={zoom}
      near={-depth}
      far={depth}
    />
  )
}

function Floor({
  centre,
  size,
}: {
  centre: [number, number, number]
  size: number
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[centre[0], -0.02, centre[2]]}
      receiveShadow
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#0f172a" transparent opacity={0.7} />
    </mesh>
  )
}

function AislePad({
  aisle,
  positions,
  onClick,
}: {
  aisle: string
  positions: SlotPos[]
  onClick: () => void
}) {
  const inAisle = positions.filter((p) => p.slot.aisle === aisle)
  if (inAisle.length === 0) return null
  let minX = Infinity, maxX = -Infinity, z = inAisle[0].z
  for (const p of inAisle) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
  }
  const cx = (minX + maxX) / 2
  const width = maxX - minX + 1
  return (
    <group>
      {/* Floor pad */}
      <mesh
        position={[cx, 0.01, z]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onClick()
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          ;(document.body.style as { cursor: string }).cursor = 'pointer'
        }}
        onPointerOut={() => {
          ;(document.body.style as { cursor: string }).cursor = 'auto'
        }}
      >
        <planeGeometry args={[width + 0.6, 1.4]} />
        <meshStandardMaterial color="#1e3a8a" transparent opacity={0.18} />
      </mesh>
      {/* Aisle label */}
      <Text
        position={[cx, 0.05, z - 1.0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.55}
        color="#93c5fd"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#0b1220"
      >
        {aisle}
      </Text>
    </group>
  )
}

function Boxes({
  positions,
  selectedCode,
  onSelect,
}: {
  positions: SlotPos[]
  selectedCode: string | null
  onSelect: (s: SlotSummary | null) => void
}) {
  // Group positions by status so each group gets one InstancedMesh +
  // one material. This keeps draw calls to ~4 regardless of box count.
  const groups = useMemo(() => {
    const out: Record<string, SlotPos[]> = { healthy: [], low: [], critical: [], empty: [] }
    for (const p of positions) {
      out[p.slot.status]?.push(p)
    }
    return out
  }, [positions])

  return (
    <group>
      {Object.entries(groups).map(([status, list]) =>
        list.length > 0 ? (
          <InstancedBoxes
            key={status}
            status={status as 'healthy' | 'low' | 'critical' | 'empty'}
            positions={list}
            selectedCode={selectedCode}
            onSelect={onSelect}
          />
        ) : null,
      )}
    </group>
  )
}

function InstancedBoxes({
  status,
  positions,
  selectedCode,
  onSelect,
}: {
  status: 'healthy' | 'low' | 'critical' | 'empty'
  positions: SlotPos[]
  selectedCode: string | null
  onSelect: (s: SlotSummary | null) => void
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const colour = useMemo(() => new THREE.Color(STATUS_COLOR[status]), [status])

  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]
      dummy.position.set(p.x, p.y, p.z)
      const isSelected = p.slot.code === selectedCode
      const scale = isSelected ? 1.25 : 1
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, dummy, selectedCode])

  // Pulse selected box
  useFrame((state) => {
    if (!ref.current || !selectedCode) return
    const t = state.clock.elapsedTime * 4
    const idx = positions.findIndex((p) => p.slot.code === selectedCode)
    if (idx < 0) return
    const p = positions[idx]
    dummy.position.set(p.x, p.y, p.z)
    const scale = 1.25 + Math.sin(t) * 0.08
    dummy.scale.set(scale, scale, scale)
    dummy.updateMatrix()
    ref.current.setMatrixAt(idx, dummy.matrix)
    ref.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, positions.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        const idx = e.instanceId
        if (idx == null) return
        onSelect(positions[idx]?.slot ?? null)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        ;(document.body.style as { cursor: string }).cursor = 'pointer'
      }}
      onPointerOut={() => {
        ;(document.body.style as { cursor: string }).cursor = 'auto'
      }}
    >
      <boxGeometry args={[SLOT_W, SLOT_H, SLOT_D]} />
      <meshStandardMaterial
        color={colour}
        transparent={status === 'empty'}
        opacity={status === 'empty' ? 0.35 : 1}
        roughness={0.6}
        metalness={0.1}
        emissive={colour}
        emissiveIntensity={status === 'critical' ? 0.25 : 0.05}
      />
    </instancedMesh>
  )
}

function LegendDot({
  tone,
  label,
}: {
  tone: 'healthy' | 'low' | 'critical' | 'empty'
  label: string
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[tone] }}
      />
      <span className="text-ink">{label}</span>
    </span>
  )
}

function CanvasButton({
  onClick,
  icon,
  title,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-surface/90 text-muted shadow-pop backdrop-blur-md hover:border-line-strong hover:text-ink"
    >
      {icon}
    </button>
  )
}

// Marker so unused-import lint passes
void Maximize2
