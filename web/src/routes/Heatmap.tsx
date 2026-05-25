import { Warehouse3D } from '@/features/heatmap/Warehouse3D'

/**
 * /heatmap — the flagship isometric 3D view of the warehouse. Every
 * slot is rendered as a colour-coded box you can orbit, zoom, click.
 * Doubles as a "wow" view and a real diagnostic tool — patterns of
 * red/orange cluster visibly across aisles.
 */
export function Heatmap() {
  return (
    <div className="h-[calc(100dvh-9rem)] sm:h-[calc(100vh-12rem)]">
      <Warehouse3D />
    </div>
  )
}
