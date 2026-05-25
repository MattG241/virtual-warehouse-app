import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ScanLine, Camera, KeySquare, Check, X, Clock, ArrowRight } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useInventory } from '@/features/inventory/store'
import { cn } from '@/lib/cn'
import { fmtN, timeAgo } from '@/lib/inventory'

// Native BarcodeDetector is gated to Chromium/Android Safari at time of
// writing. Fall back to a manual entry prompt elsewhere so the button
// still does something useful.
const SUPPORTS_DETECTOR =
  typeof window !== 'undefined' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (window as any).BarcodeDetector !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function'

interface ScanRecord {
  raw: string
  resolved: string
  kind: 'sku' | 'location' | 'unknown'
  name?: string
  units?: number
  at: number
}

export function Scan() {
  const inv = useInventory((s) => s.inventory)
  const navigate = useNavigate()
  const [scanning, setScanning] = useState(false)
  const [history, setHistory] = useState<ScanRecord[]>(() => {
    try {
      const raw = localStorage.getItem('vw.scanHistory')
      return raw ? (JSON.parse(raw) as ScanRecord[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('vw.scanHistory', JSON.stringify(history.slice(0, 30)))
    } catch {
      /* ignore */
    }
  }, [history])

  const resolve = useCallback(
    (raw: string): ScanRecord => {
      const value = raw.trim()
      const at = Date.now()
      if (!inv) return { raw: value, resolved: value, kind: 'unknown', at }

      const barcodeHit = inv.barcodeToSku?.[value]
      const sku = barcodeHit || value
      const meta = inv.skus?.[sku]
      if (meta) {
        // Sum units across all locations holding this SKU
        let units = 0
        for (const entries of Object.values(inv.grid)) {
          for (const [s, q] of entries) if (s === sku) units += Number(q) || 0
        }
        for (const [, s, q] of inv.other) {
          if (s === sku) units += Number(q) || 0
        }
        return { raw: value, resolved: sku, kind: 'sku', name: meta[0] || '', units, at }
      }
      // Location lookup
      if (inv.grid[value]) {
        const units = inv.grid[value].reduce((s, [, q]) => s + (Number(q) || 0), 0)
        return { raw: value, resolved: value, kind: 'location', units, at }
      }
      return { raw: value, resolved: value, kind: 'unknown', at }
    },
    [inv],
  )

  const handleScan = useCallback(
    (raw: string) => {
      const rec = resolve(raw)
      setHistory((h) => [rec, ...h.filter((x) => x.raw !== rec.raw)].slice(0, 30))
      if (rec.kind === 'sku') {
        navigate(`/inventory?q=${encodeURIComponent(rec.resolved)}`)
      } else if (rec.kind === 'location') {
        navigate(`/warehouse?loc=${encodeURIComponent(rec.resolved)}`)
      }
    },
    [navigate, resolve],
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          eyebrow="Scan or enter"
          title="Barcode scanner"
          action={
            SUPPORTS_DETECTOR ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-good/15 px-2 py-0.5 text-[11px] font-semibold text-good">
                <Check className="h-3 w-3" /> Camera ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn">
                Camera unsupported
              </span>
            )
          }
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setScanning(true)}
              icon={<Camera className="h-5 w-5" />}
              className="!w-full !h-14 !text-base"
              disabled={!SUPPORTS_DETECTOR}
            >
              {SUPPORTS_DETECTOR ? 'Start camera scan' : 'Camera unsupported'}
            </Button>
            <ManualEntry onSubmit={handleScan} />
          </div>
          {!SUPPORTS_DETECTOR && (
            <p className="text-xs text-muted">
              Native camera scanning needs Chrome / Edge / Android Safari. Use a
              wired scanner — it'll arrive as keystrokes in the input above and
              auto-submit on Enter.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Recent" title="Scan history" />
        <CardBody className="!p-0">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-muted">
                <ScanLine className="h-5 w-5" />
              </span>
              <div className="text-sm font-semibold text-ink">Nothing scanned yet</div>
              <p className="max-w-xs text-xs text-muted">
                Scan a SKU barcode or location label and it'll show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {history.map((rec) => (
                <li key={`${rec.raw}-${rec.at}`}>
                  <button
                    type="button"
                    onClick={() => handleScan(rec.raw)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
                  >
                    <span
                      className={cn(
                        'grid h-9 w-9 flex-shrink-0 place-items-center rounded-md',
                        rec.kind === 'sku' && 'bg-brand/15 text-brand',
                        rec.kind === 'location' && 'bg-warn/15 text-warn',
                        rec.kind === 'unknown' && 'bg-bad/15 text-bad',
                      )}
                    >
                      {rec.kind === 'unknown' ? (
                        <X className="h-4 w-4" />
                      ) : (
                        <ScanLine className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm font-semibold text-ink">
                        {rec.resolved}
                      </div>
                      <div className="truncate text-[11px] text-muted">
                        {rec.kind === 'sku'
                          ? rec.name || 'SKU'
                          : rec.kind === 'location'
                            ? 'Location'
                            : 'Not recognised'}
                        {typeof rec.units === 'number' && ` · ${fmtN(rec.units)} units`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-muted">
                      <Clock className="h-3 w-3" />
                      {timeAgo(new Date(rec.at).toISOString())}
                    </div>
                    {rec.kind !== 'unknown' && (
                      <ArrowRight className="h-4 w-4 text-subtle transition group-hover:translate-x-1 group-hover:text-ink" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {scanning && SUPPORTS_DETECTOR && (
        <CameraSheet
          onClose={() => setScanning(false)}
          onDetected={(raw) => {
            setScanning(false)
            handleScan(raw)
          }}
        />
      )}
    </div>
  )
}

function ManualEntry({ onSubmit }: { onSubmit: (raw: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!v.trim()) return
        onSubmit(v.trim())
        setV('')
      }}
    >
      <div className="relative flex-1">
        <KeySquare className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          inputMode="text"
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Type or paste a SKU / barcode / location"
          className="h-14 w-full rounded-lg border border-line bg-surface pl-10 pr-3 text-sm text-ink placeholder:text-subtle focus:border-brand-ring focus:outline-none focus:ring-2 focus:ring-brand-ring/30"
        />
      </div>
      <Button type="submit" variant="secondary" size="lg" className="!h-14 !text-sm">
        Go
      </Button>
    </form>
  )
}

interface CameraSheetProps {
  onDetected: (raw: string) => void
  onClose: () => void
}

function CameraSheet({ onDetected, onClose }: CameraSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState('Starting camera…')
  const detectorRef = useRef<{
    stream: MediaStream | null
    rafId: number | null
    detected: boolean
  }>({ stream: null, rafId: null, detected: false })

  useEffect(() => {
    const state = detectorRef.current
    let cancelled = false

    async function start() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BD = (window as any).BarcodeDetector
        const supported: string[] = await BD.getSupportedFormats?.().catch(() => []) || []
        const useful = ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
        const formats = useful.filter((f) => supported.includes(f))
        const detector = new BD({ formats: formats.length ? formats : supported })

        state.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          state.stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = state.stream
        await video.play()
        setStatus('Looking for a barcode…')

        let lastHit = 0
        const tick = async () => {
          if (cancelled || !state.stream || state.detected) return
          try {
            const found = await detector.detect(video)
            if (found.length) {
              const now = Date.now()
              if (now - lastHit > 600) {
                lastHit = now
                state.detected = true
                onDetected(found[0].rawValue || String(found[0].rawValue))
                return
              }
            }
          } catch {
            /* bad frame */
          }
          state.rafId = requestAnimationFrame(tick)
        }
        state.rafId = requestAnimationFrame(tick)
      } catch (err) {
        setStatus(`Camera failed: ${(err as Error).message}`)
      }
    }
    start()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    return () => {
      cancelled = true
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      if (state.rafId) cancelAnimationFrame(state.rafId)
      if (state.stream) state.stream.getTracks().forEach((t) => t.stop())
    }
  }, [onClose, onDetected])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <h2 className="text-sm font-semibold">Scan a barcode</h2>
        <button
          type="button"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close scanner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {/* Reticle */}
        <div className="pointer-events-none absolute inset-12 flex items-center justify-center">
          <div className="relative h-48 w-72 max-w-[80vw] rounded-2xl ring-2 ring-brand-ring/80 sm:h-56 sm:w-80">
            {/* Corners */}
            <Corners />
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 animate-pulse-soft bg-brand-ring/80 shadow-[0_0_12px_rgb(var(--brand-ring)/0.9)]" />
          </div>
        </div>
      </div>
      <div className="bg-black px-4 py-3 text-center text-sm text-white/80">{status}</div>
    </div>
  )
}

function Corners() {
  const base =
    'absolute h-6 w-6 border-brand-ring [border-style:solid] [border-width:0]'
  return (
    <>
      <span className={cn(base, 'left-[-2px] top-[-2px] border-l-2 border-t-2 rounded-tl-2xl')} />
      <span className={cn(base, 'right-[-2px] top-[-2px] border-r-2 border-t-2 rounded-tr-2xl')} />
      <span className={cn(base, 'bottom-[-2px] left-[-2px] border-b-2 border-l-2 rounded-bl-2xl')} />
      <span
        className={cn(base, 'bottom-[-2px] right-[-2px] border-b-2 border-r-2 rounded-br-2xl')}
      />
    </>
  )
}
