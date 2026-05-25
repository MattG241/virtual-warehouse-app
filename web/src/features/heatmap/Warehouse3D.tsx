// Isometric 3D warehouse heatmap — every BAY-LEVEL of every aisle is
// rendered as a colour-coded block. Each block aggregates the slots at
// that bay-level (typically 7 slots) and uses the worst non-empty status,
// so a single critical slot makes the whole block flash red. On a phone
// 10k slot-sized boxes were <2px each and indistinguishable; ~1.5k
// bay-level blocks are 12–14px each and actually communicate state.
//
// Click a block → bay-level summary panel + Walk button to drill into
// the rack view. Click an aisle floor pad → straight into the aisle.
//
// Performance: instanced meshes, one per status colour (≤4 draw calls).

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
import type { SlotSummary, Status } from '@/lib/types'

// Spacing constants (world units). A "block" is one bay-level — square
// enough to read on a phone, tall enough that level segments stack
// visibly into a tower per bay.
const BAY_W = 1.0       // X: bay width
const LEVEL_H = 0.6     // Y: single level height
const BAY_D = 0.85      // Z: block depth (≈ one bay deep)
const LEVEL_GAP = 0.04
const BAY_GAP = 0.15    // between adjacent bays in the same aisle
const AISLE_GAP = 1.8   // walkway between adjacent aisles

const STATUS_COLOR: Record<Status, string> = {
  empty: '#1b3a5b',     // muted blue
  critical: '#dc2626',  // red
  low: '#f59e0b',       // orange
  healthy: '#22c55e',   // green
}

const STATUS_RANK: Record<Status, number> = {
  critical: 3, low: 2, healthy: 1, empty: 0,
}

interface BayBlock {
  code: string   // A01.B05.L03 — bay-level (no slot)
  aisle: string  // A01
  bay: string    // B05
  level: string  // L03
  bayIdx: number   // 0-indexed (B05 → 4)
  levelIdx: number // 0-indexed (L03 → 2)
  status: Status
  totalUnits: number
  slotCount: number    // # of physical slots aggregated into this block
  emptyCount: number   // # of those slots that are empty
  topSku: { sku: string; name: string; qty: number } | null
}

function aggregateBayLevels(slots: SlotSummary[]): BayBlock[] {
  const map = new Map<string, BayBlock>()
  for (const s of slots) {
    const code = `${s.aisle}.${s.bay}.${s.level}`
    let b = map.get(code)
    if (!b) {
      b = {
        code,
        aisle: s.aisle,
        bay: s.bay,
        level: s.level,
        bayIdx: parseInt(s.bay.slice(1), 10) - 1,
        levelIdx: parseInt(s.level.slice(1), 10) - 1,
        status: 'empty',
        totalUnits: 0,
        slotCount: 0,
        emptyCount: 0,
        topSku: null,
      }
      map.set(code, b)
    }
    b.totalUnits += s.totalUnits
    b.slotCount += 1
    if (s.status === 'empty') b.emptyCount += 1
    if (STATUS_RANK[s.status] > STATUS_RANK[b.status]) b.status = s.status
    const heaviest = s.skus.reduce<{ sku: string; name: string; qty: number } | null>(
      (acc, x) => (acc && acc.qty >= x.qty ? acc : { sku: x.sku, name: x.name, qty: x.qty }),
      null,
    )
    if (heaviest && (!b.topSku || heaviest.qty > b.topSku.qty)) b.topSku = heaviest
  }
  return Array.from(map.values())
}

interface BlockPos {
  block: BayBlock
  x: number
  y: number
  z: number
}

function layoutBayLevels(blocks: BayBlock[]): BlockPos[] {
  const baysPerAisle = new Map<string, number>()
  for (const b of blocks) {
    baysPerAisle.set(b.aisle, Math.max(baysPerAisle.get(b.aisle) || 0, b.bayIdx + 1))
  }
  const aisleIds = [...baysPerAisle.keys()].sort()
  const bayStep = BAY_W + BAY_GAP
  const levelStep = LEVEL_H + LEVEL_GAP
  const aisleStep = BAY_D + AISLE_GAP

  const out: BlockPos[] = []
  for (const block of blocks) {
    const aisleIdx = aisleIds.indexOf(block.aisle)
    if (aisleIdx === -1) continue
    const bayCount = baysPerAisle.get(block.aisle) || 1
    const aisleHalfWidth = (bayCount * bayStep - BAY_GAP) / 2
    const x = block.bayIdx * bayStep - aisleHalfWidth + BAY_W / 2
    const y = block.levelIdx * levelStep + LEVEL_H / 2
    const z = aisleIdx * aisleStep
    out.push({ block, x, y, z })
  }
  return out
}

interface Props {
  onClose?: () => void
}

export function Warehouse3D({ onClose }: Props) {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<BayBlock | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  // Bumping this key remounts the Canvas + camera + controls from scratch.
  // Cheaper than fighting OrbitControls' internal saved-state, and always
  // recovers if the user drifts the camera off the warehouse.
  const [resetKey, setResetKey] = useState(0)

  const blocks = useMemo(() => (inv ? aggregateBayLevels(allSlots(inv)) : []), [inv])
  const positions = useMemo(() => layoutBayLevels(blocks), [blocks])
  const visible = useMemo(
    () => (hideEmpty ? positions.filter((p) => p.block.status !== 'empty') : positions),
    [positions, hideEmpty],
  )

  // Aggregate counts for the legend chip so the user sees how many of
  // each status they're looking at — far more useful than just colour keys.
  const statusCounts = useMemo(() => {
    const c: Record<Status, number> = { healthy: 0, low: 0, critical: 0, empty: 0 }
    for (const p of positions) c[p.block.status]++
    return c
  }, [positions])

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
    for (const p of positions) set.add(p.block.aisle)
    return [...set].sort()
  }, [positions])

  // Label fontSize scales with scene so aisle/bay labels stay readable.
  const labelSize = Math.max(0.5, bounds.size * 0.028)

  // Initial camera zoom that frames the warehouse. Computed once here so
  // OrbitControls can scale its min/max relative to it — otherwise an
  // absolute maxZoom (5) clamps the initial framing zoom (~10 on a real
  // warehouse) and you can't pinch in past the starting view.
  const initialZoom = Math.max(2, Math.min(40, 320 / Math.max(bounds.size, 1)))

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
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl border border-line bg-bg/80"
      style={{ touchAction: 'none' }}
    >
      <Canvas
        key={resetKey}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: false }}
        style={{ background: 'radial-gradient(ellipse at center, #11203a 0%, #050a14 70%)' }}
      >
        <color attach="background" args={['#0a1428']} />
        <SceneCamera centre={bounds.centre} size={bounds.size} zoom={initialZoom} />
        <OrbitControls
          enablePan
          enableRotate
          enableZoom
          // zoomToCursor was drifting the target off-scene over multiple
          // pinches — the scene would slide into a corner and you couldn't
          // find it again. Centre-of-screen zoom is less natural but
          // predictable, and the Reset button is right there for recovery.
          zoomSpeed={1.2}
          // Cap maxZoom at a deep-but-bounded multiple of the initial
          // framing — Infinity let users pinch into nothingness and not
          // know how to get back. 100× gets you down to a few centimetres
          // of warehouse on a phone, plenty for slot-level inspection.
          minZoom={initialZoom * 0.3}
          maxZoom={initialZoom * 100}
          target={bounds.centre}
          dampingFactor={0.12}
        />
        <ambientLight intensity={0.65} />
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
            labelSize={labelSize}
            onClick={() => navigate(`/warehouse/${aisle}`)}
          />
        ))}

        {/* Bay number markers (every 5 bays) for orientation */}
        <BayMarkers positions={positions} labelSize={labelSize * 0.55} />

        {/* Instanced bay-level blocks — one mesh per status colour */}
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
          <div className="flex flex-wrap gap-1.5 rounded-full bg-bg/85 px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-line backdrop-blur-md">
            <LegendDot tone="healthy" label="Stocked" count={statusCounts.healthy} />
            <LegendDot tone="low" label="Low" count={statusCounts.low} />
            <LegendDot tone="critical" label="Critical" count={statusCounts.critical} />
            <LegendDot tone="empty" label="Empty" count={statusCounts.empty} />
          </div>
          <div className="flex gap-1.5">
            <CanvasButton
              title={hideEmpty ? 'Show empty blocks' : 'Hide empty blocks'}
              onClick={() => setHideEmpty((v) => !v)}
              icon={hideEmpty ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            />
            <CanvasButton
              title="Reset camera"
              onClick={() => setResetKey((k) => k + 1)}
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

        {/* Selected bay-level panel — floats over the canvas bottom */}
        {selected ? (
          <div className="pointer-events-auto mx-auto mt-auto mb-3 w-[calc(100%-1.5rem)] max-w-sm rounded-2xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-lg font-mono text-[10px] font-bold leading-tight"
                style={{
                  background: `${STATUS_COLOR[selected.status]}22`,
                  color: STATUS_COLOR[selected.status],
                }}
              >
                {fmtN(selected.totalUnits)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-sm font-bold text-ink">{selected.code}</div>
                <div className="truncate text-[11px] text-muted">
                  {selected.slotCount - selected.emptyCount} / {selected.slotCount} slots filled
                  {selected.topSku ? ` · top SKU ${selected.topSku.sku}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/warehouse/${selected.aisle}?slot=${encodeURIComponent(
                      `${selected.code}.S1`,
                    )}`,
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
        ) : (
          <div className="pointer-events-none mx-auto mt-auto mb-3 rounded-full bg-bg/70 px-3 py-1 text-[11px] text-muted ring-1 ring-line backdrop-blur-md">
            Tap a block for bay detail · drag to rotate · pinch to zoom
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
  zoom,
}: {
  centre: [number, number, number]
  size: number
  zoom: number
}) {
  // Isometric position — 45° azimuth, ~38° elevation (slightly higher
  // than classic 30° so the whole warehouse footprint stays readable
  // from above on a phone).
  const distance = size * 1.4
  const pos: [number, number, number] = [
    centre[0] + distance,
    centre[1] + distance * 1.1,
    centre[2] + distance,
  ]
  // Near/far must scale with the scene — at isometric distance, the
  // target sits ~1.7× `distance` from the lens, so fixed values clipped
  // every block on real warehouses.
  const depth = Math.max(500, size * 5)
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
  labelSize,
  onClick,
}: {
  aisle: string
  positions: BlockPos[]
  labelSize: number
  onClick: () => void
}) {
  const inAisle = positions.filter((p) => p.block.aisle === aisle)
  if (inAisle.length === 0) return null
  let minX = Infinity, maxX = -Infinity
  const z = inAisle[0].z
  for (const p of inAisle) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
  }
  const cx = (minX + maxX) / 2
  const width = maxX - minX + BAY_W
  const padDepth = BAY_D + 0.6
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
        <planeGeometry args={[width + 0.4, padDepth]} />
        <meshStandardMaterial color="#1e3a8a" transparent opacity={0.28} />
      </mesh>
      {/* Aisle label below the pad — bigger so it's actually readable
       *  at full-warehouse zoom on a phone. */}
      <Text
        position={[cx, 0.05, z + padDepth * 0.55]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={labelSize}
        color="#bfdbfe"
        anchorX="center"
        anchorY="middle"
        outlineWidth={labelSize * 0.05}
        outlineColor="#0b1220"
      >
        {aisle}
      </Text>
    </group>
  )
}

function BayMarkers({
  positions,
  labelSize,
}: {
  positions: BlockPos[]
  labelSize: number
}) {
  // One small label every 5 bays (and at bay 1) on the front-most aisle,
  // for orientation. Avoids text spam at every bay while keeping the
  // X-axis interpretable.
  const markers = useMemo(() => {
    const minZ = positions.reduce((m, p) => Math.min(m, p.z), Infinity)
    const front = positions.filter((p) => p.z === minZ && p.block.levelIdx === 0)
    const seen = new Set<number>()
    const out: { x: number; z: number; label: string }[] = []
    for (const p of front) {
      const idx = p.block.bayIdx
      if (idx !== 0 && (idx + 1) % 5 !== 0) continue
      if (seen.has(idx)) continue
      seen.add(idx)
      out.push({ x: p.x, z: p.z - BAY_D * 0.6, label: p.block.bay })
    }
    return out
  }, [positions])

  if (markers.length === 0) return null
  return (
    <group>
      {markers.map((m) => (
        <Text
          key={`${m.x}-${m.label}`}
          position={[m.x, 0.04, m.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={labelSize}
          color="#7c8aa1"
          anchorX="center"
          anchorY="middle"
        >
          {m.label}
        </Text>
      ))}
    </group>
  )
}

function Boxes({
  positions,
  selectedCode,
  onSelect,
}: {
  positions: BlockPos[]
  selectedCode: string | null
  onSelect: (b: BayBlock | null) => void
}) {
  // Group positions by status so each group gets one InstancedMesh +
  // one material. This keeps draw calls to ~4 regardless of block count.
  const groups = useMemo(() => {
    const out: Record<Status, BlockPos[]> = { healthy: [], low: [], critical: [], empty: [] }
    for (const p of positions) out[p.block.status]?.push(p)
    return out
  }, [positions])

  return (
    <group>
      {(Object.entries(groups) as [Status, BlockPos[]][]).map(([status, list]) =>
        list.length > 0 ? (
          <InstancedBoxes
            key={status}
            status={status}
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
  status: Status
  positions: BlockPos[]
  selectedCode: string | null
  onSelect: (b: BayBlock | null) => void
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
      const isSelected = p.block.code === selectedCode
      const scale = isSelected ? 1.2 : 1
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, dummy, selectedCode])

  // Pulse the selected block
  useFrame((state) => {
    if (!ref.current || !selectedCode) return
    const idx = positions.findIndex((p) => p.block.code === selectedCode)
    if (idx < 0) return
    const p = positions[idx]
    const t = state.clock.elapsedTime * 4
    dummy.position.set(p.x, p.y, p.z)
    const scale = 1.2 + Math.sin(t) * 0.08
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
        onSelect(positions[idx]?.block ?? null)
      }}
      onPointerOver={(e) => {
        e.stopPropagation()
        ;(document.body.style as { cursor: string }).cursor = 'pointer'
      }}
      onPointerOut={() => {
        ;(document.body.style as { cursor: string }).cursor = 'auto'
      }}
    >
      <boxGeometry args={[BAY_W, LEVEL_H, BAY_D]} />
      <meshStandardMaterial
        color={colour}
        transparent={status === 'empty'}
        opacity={status === 'empty' ? 0.32 : 1}
        roughness={0.6}
        metalness={0.1}
        emissive={colour}
        emissiveIntensity={status === 'critical' ? 0.3 : 0.05}
      />
    </instancedMesh>
  )
}

function LegendDot({
  tone,
  label,
  count,
}: {
  tone: Status
  label: string
  count: number
}) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOR[tone] }}
      />
      <span className="text-ink">{label}</span>
      <span className="text-muted tabular-nums">{fmtN(count)}</span>
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
