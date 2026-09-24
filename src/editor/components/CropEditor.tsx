import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Crop } from '../../shared/types'
import { cropCursor, cropFromPoints, cropGestureAt, moveCrop, resizeCrop, type CropGesture } from '../lib/crop-interaction'
import { Check, Refresh, X } from './icons'
import { Button, cx } from './ui'

type Point = { x: number; y: number }

export function CropEditor({ sourceUrl, sourceAspect, initial, onApply, onCancel }: {
  sourceUrl: string
  sourceAspect: number
  initial: Crop
  onApply: (crop: Crop) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const start = useRef<{ point: Point; crop: Crop; gesture: CropGesture } | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState('crosshair')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const point = (event: ReactPointerEvent<HTMLDivElement>): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 }
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height }
  }
  /** Grab distance: 12 screen pixels, whatever size the dialog is. */
  const tolerance = () => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    return rect && rect.width && rect.height ? { x: 12 / rect.width, y: 12 / rect.height } : { x: 0.02, y: 0.02 }
  }
  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const p = point(event)
    start.current = { point: p, crop: draft, gesture: cropGestureAt(p, draft, tolerance()) }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = start.current
    const p = point(event)
    if (!active) {
      const next = cropCursor(cropGestureAt(p, draft, tolerance()))
      if (next !== cursor) setCursor(next)
      return
    }
    // Keep the gesture fixed for the whole drag, so a move stays a move and a
    // resize stays a resize even when the pointer crosses the selection edge.
    const dx = p.x - active.point.x
    const dy = p.y - active.point.y
    const g = active.gesture
    if (g.mode === 'move') setDraft(moveCrop(active.crop, dx, dy))
    else if (g.mode === 'resize') setDraft(resizeCrop(active.crop, g.edges, dx, dy))
    else setDraft(cropFromPoints(active.point, p))
  }
  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (start.current) {
      onMove(event)
      start.current = null
    }
  }
  const reset = () => setDraft({ x: 0, y: 0, width: 1, height: 1 })

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg-0/90 p-8" role="dialog" aria-label="Crop source">
      <div className="flex max-h-full w-full max-w-[900px] flex-col gap-3 rounded-[10px] border border-line-strong bg-bg-1 p-3 shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2">
          <div><div className="text-[13px] font-medium text-fg">Crop source</div><div className="text-[11px] text-fg-dim">Drag across the picture to crop. Drag a corner or edge to resize, or the middle to move it.</div></div>
          <div className="ml-auto flex gap-1.5"><Button size="sm" onClick={reset} icon={<Refresh size={13} />} aria-label="Reset crop">Reset</Button><Button size="sm" onClick={onCancel} icon={<X size={13} />}>Cancel</Button><Button size="sm" variant="primary" onClick={() => onApply(draft)} icon={<Check size={13} />}>Apply</Button></div>
        </div>
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-[7px] bg-black">
          <div ref={surfaceRef} className={cx('relative w-full select-none touch-none')} style={{ aspectRatio: sourceAspect > 0 ? sourceAspect : 16 / 9, cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <video className="pointer-events-none absolute inset-0 h-full w-full object-contain" src={sourceUrl} muted autoPlay loop playsInline />
            <div className="pointer-events-none absolute inset-0 bg-black/45" />
            <div className="pointer-events-none absolute border-2 border-accent bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.width * 100}%`, height: `${draft.height * 100}%` }}>
              <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-sm border-2 border-white bg-accent" /><span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-sm border-2 border-white bg-accent" /><span className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-sm border-2 border-white bg-accent" /><span className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm border-2 border-white bg-accent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
