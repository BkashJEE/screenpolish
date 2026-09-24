import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Overlay, ZoomSegment } from '../../shared/types'
import { clipAt, type Clip } from '../../shared/cuts'
import { hitTestOverlayLane, MIN_OVERLAY_LENGTH, type OverlayPatch } from '../lib/overlays'
import { MIN_SEGMENT_LENGTH, hitTestScrub, shiftSegment, type SegmentPatch, trimHandleHit } from '../lib/segments'
import { snapRange, snapTime } from '../lib/snapping'
import { clamp, formatTime, timeToX, xToTime } from '../lib/time'
import { cx } from './ui'

const RULER_H = 20
const GAP = 4
const LANE_H = 34
const OVERLAY_LANE_H = 28
const SNAP_PX = 8
const CLIP_LANE_H = 26
const HEIGHT = RULER_H + GAP + LANE_H + GAP + OVERLAY_LANE_H + GAP + CLIP_LANE_H
const HANDLE_PX = 7
const MIN_TRIM = 0.2

export interface ScrubBarProps {
  duration: number
  time: number
  trim: { start: number; end: number }
  segments: ZoomSegment[]
  selectedId: string | null
  overlays: Overlay[]
  selectedOverlayId: string | null
  onSeek: (t: number) => void
  onTrim: (trim: { start: number; end: number }) => void
  onSelect: (id: string | null) => void
  onAddSegment: (t: number) => void
  /** Returns the segment as it exists after the edit (auto segments become manual copies). */
  onResizeSegment: (segment: ZoomSegment, patch: SegmentPatch) => ZoomSegment
  /** Where recording resumed after a pause; drawn as amber marks on the ruler. */
  pauses?: Array<{ t: number; durationSec: number }>
  onSelectOverlay: (id: string | null) => void
  onResizeOverlay: (id: string, patch: OverlayPatch) => void
  /** Timeline slices, removed ones included. */
  clips?: Clip[]
  selectedClipId?: string | null
  onSelectClip?: (id: string | null) => void
}

type Drag =
  | { mode: 'seek' }
  | { mode: 'maybe-add'; startX: number; t: number }
  | { mode: 'trim-start' }
  | { mode: 'trim-end' }
  | { mode: 'seg-start'; segment: ZoomSegment }
  | { mode: 'seg-end'; segment: ZoomSegment }
  | { mode: 'seg-maybe-move'; segment: ZoomSegment; startX: number; grabOffset: number }
  | { mode: 'seg-move'; segment: ZoomSegment; grabOffset: number }
  | { mode: 'overlay-start'; overlay: Overlay }
  | { mode: 'overlay-end'; overlay: Overlay }

function pickStep(duration: number, width: number): number {
  const candidates = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
  for (const c of candidates) if ((c / duration) * width >= 64) return c
  return candidates[candidates.length - 1]
}

const STYLE_GLYPH: Record<string, string> = {
  'tilt-left': '◣ ',
  'tilt-right': '◢ ',
  'tilt-up': '△ ',
  'tilt-down': '▽ ',
  drift: '→ ',
  punch: '★ '
}
const STYLE_LABEL: Record<string, string> = {
  zoom: 'zoom',
  'tilt-left': 'tilt from left',
  'tilt-right': 'tilt from right',
  'tilt-up': 'tilt from top',
  'tilt-down': 'tilt from bottom',
  drift: 'drift',
  punch: 'punch'
}
export const styleGlyph = (style?: string): string => STYLE_GLYPH[style ?? 'zoom'] ?? ''
export const styleLabel = (style?: string): string => STYLE_LABEL[style ?? 'zoom'] ?? 'zoom'

export const ScrubBar = memo(function ScrubBar(props: ScrubBarProps) {
  const {
    pauses,
    duration,
    time,
    trim,
    segments,
    selectedId,
    overlays,
    selectedOverlayId,
    onSeek,
    onTrim,
    onSelect,
    onAddSegment,
    onResizeSegment,
    onSelectOverlay,
    onResizeOverlay,
    clips = [],
    selectedClipId = null,
    onSelectClip
  } = props
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const drag = useRef<Drag | null>(null)
  const [cursor, setCursor] = useState<string>('default')
  const [snapGuide, setSnapGuide] = useState<number | null>(null)
  const ready = Number.isFinite(duration) && duration > 0 && width > 0

  const snapTargets = useMemo(
    () => [0, duration, time, trim.start, trim.end, ...segments.flatMap((segment) => [segment.start, segment.end]), ...overlays.flatMap((overlay) => [overlay.start, overlay.end > 0 ? overlay.end : duration])],
    [duration, overlays, segments, time, trim.end, trim.start]
  )

  const point = (value: number, event: ReactPointerEvent, exclude: number[] = []) => {
    if (event.altKey) {
      setSnapGuide(null)
      return value
    }
    const targets = snapTargets.filter((target) => !exclude.some((own) => Math.abs(own - target) < 1e-6))
    const snapped = snapTime(value, targets, (SNAP_PX / Math.max(width, 1)) * duration)
    setSnapGuide(snapped.target)
    return snapped.value
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0))
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const ticks = useMemo(() => {
    if (!ready) return []
    const step = pickStep(duration, width)
    const out: Array<{ t: number; major: boolean }> = []
    const minor = step / 4
    for (let t = 0; t <= duration + 1e-6; t += minor) {
      const major = Math.abs(t / step - Math.round(t / step)) < 1e-6
      out.push({ t, major })
    }
    return out
  }, [duration, width, ready])

  const localX = (e: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect()
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 }
  }

  const hitAt = (x: number, y: number) => {
    const inRuler = y < RULER_H + GAP / 2
    return hitTestScrub({ x, width, duration, trim, segments: inRuler ? [] : segments, handlePx: HANDLE_PX })
  }

  // The trim handles are drawn across all three lanes; they must be grabbable
  // anywhere along that height, not only where they cross the zoom lane.
  const handleTop = RULER_H + GAP - 2
  const handleBottom = handleTop + LANE_H + GAP + OVERLAY_LANE_H + GAP + CLIP_LANE_H + 4
  const trimAt = (x: number, y: number) => trimHandleHit({ x, y, width, duration, trim, top: handleTop, bottom: handleBottom, handlePx: HANDLE_PX })

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ready || e.button !== 0) return
    const { x, y } = localX(e)
    const trimHit = trimAt(x, y)
    if (trimHit) {
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { mode: trimHit }
      return
    }
    const overlayLaneTop = RULER_H + GAP + LANE_H + GAP
    const clipLaneTop = overlayLaneTop + OVERLAY_LANE_H + GAP
    if (y >= clipLaneTop) {
      // Clip lane: click selects the slice under the pointer, dragging scrubs.
      const t = xToTime(x, duration, width)
      e.currentTarget.setPointerCapture(e.pointerId)
      onSelectClip?.(clipAt(t, clips)?.id ?? null)
      onSeek(t)
      drag.current = { mode: 'seek' }
      return
    }
    if (y >= overlayLaneTop) {
      const hit = hitTestOverlayLane({ x, width, duration, overlays, handlePx: HANDLE_PX })
      const overlay = hit.kind === 'empty' ? null : overlays.find((o) => o.id === hit.id) ?? null
      e.currentTarget.setPointerCapture(e.pointerId)
      if (hit.kind === 'start' && overlay) {
        onSelectOverlay(overlay.id)
        drag.current = { mode: 'overlay-start', overlay }
      } else if (hit.kind === 'end' && overlay) {
        onSelectOverlay(overlay.id)
        drag.current = { mode: 'overlay-end', overlay }
      } else if (hit.kind === 'body' && overlay) {
        onSelectOverlay(overlay.id)
        onSeek(xToTime(x, duration, width))
        drag.current = { mode: 'seek' }
      } else {
        onSelectOverlay(null)
        onSeek(xToTime(x, duration, width))
        drag.current = { mode: 'seek' }
      }
      return
    }
    const hit = hitAt(x, y)
    const t = xToTime(x, duration, width)
    e.currentTarget.setPointerCapture(e.pointerId)
    switch (hit.kind) {
      case 'trim-start':
        drag.current = { mode: 'trim-start' }
        break
      case 'trim-end':
        drag.current = { mode: 'trim-end' }
        break
      case 'segment-start':
        onSelect(hit.segment.id)
        drag.current = { mode: 'seg-start', segment: hit.segment }
        break
      case 'segment-end':
        onSelect(hit.segment.id)
        drag.current = { mode: 'seg-end', segment: hit.segment }
        break
      case 'segment':
        onSelect(hit.segment.id)
        // A click seeks; a drag moves the whole block, keeping its length.
        drag.current = { mode: 'seg-maybe-move', segment: hit.segment, startX: x, grabOffset: t - hit.segment.start }
        break
      case 'empty':
        if (y < RULER_H + GAP / 2) {
          onSeek(t)
          drag.current = { mode: 'seek' }
        } else {
          onSelect(null)
          drag.current = { mode: 'maybe-add', startX: x, t }
        }
        break
    }
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ready) return
    const { x, y } = localX(e)
    const d = drag.current
    if (!d) {
      const overlayLaneTop = RULER_H + GAP + LANE_H + GAP
      let next: string
      if (trimAt(x, y)) {
        next = 'ew-resize'
      } else if (y >= overlayLaneTop + OVERLAY_LANE_H + GAP) {
        next = clipAt(xToTime(x, duration, width), clips) ? 'pointer' : 'default'
      } else if (y >= overlayLaneTop) {
        const hit = hitTestOverlayLane({ x, width, duration, overlays, handlePx: HANDLE_PX })
        next = hit.kind === 'start' || hit.kind === 'end' ? 'ew-resize' : hit.kind === 'body' ? 'pointer' : 'text'
      } else {
        const hit = hitAt(x, y)
        next =
          hit.kind === 'trim-start' || hit.kind === 'trim-end' || hit.kind === 'segment-start' || hit.kind === 'segment-end'
            ? 'ew-resize'
            : hit.kind === 'segment'
              ? 'pointer'
              : y < RULER_H + GAP / 2
                ? 'text'
                : 'copy'
      }
      if (next !== cursor) setCursor(next)
      return
    }
    const t = xToTime(x, duration, width)
    switch (d.mode) {
      case 'seek':
        onSeek(t)
        break
      case 'maybe-add':
        if (Math.abs(x - d.startX) > 3) {
          drag.current = { mode: 'seek' }
          onSeek(t)
        }
        break
      case 'trim-start':
        onTrim({ start: clamp(point(t, e, [trim.start]), 0, trim.end - MIN_TRIM), end: trim.end })
        break
      case 'trim-end':
        onTrim({ start: trim.start, end: clamp(point(t, e, [trim.end]), trim.start + MIN_TRIM, duration) })
        break
      case 'seg-start': {
        const start = clamp(point(t, e, [d.segment.start, d.segment.end]), 0, d.segment.end - MIN_SEGMENT_LENGTH)
        const next = onResizeSegment(d.segment, { start })
        drag.current = { mode: 'seg-start', segment: next }
        break
      }
      case 'seg-end': {
        const end = clamp(point(t, e, [d.segment.start, d.segment.end]), d.segment.start + MIN_SEGMENT_LENGTH, duration)
        const next = onResizeSegment(d.segment, { end })
        drag.current = { mode: 'seg-end', segment: next }
        break
      }
      case 'seg-maybe-move':
        if (Math.abs(x - d.startX) > 3) drag.current = { mode: 'seg-move', segment: d.segment, grabOffset: d.grabOffset }
        break
      case 'seg-move': {
        const rawStart = t - d.grabOffset
        const rawEnd = rawStart + (d.segment.end - d.segment.start)
        const targets = snapTargets.filter((target) => Math.abs(target - d.segment.start) > 1e-6 && Math.abs(target - d.segment.end) > 1e-6)
        const snapped = e.altKey ? { start: rawStart, end: rawEnd, target: null } : snapRange(rawStart, rawEnd, targets, (SNAP_PX / Math.max(width, 1)) * duration)
        setSnapGuide(snapped.target)
        const shifted = shiftSegment(d.segment, snapped.start, duration)
        const next = onResizeSegment(d.segment, shifted)
        drag.current = { mode: 'seg-move', segment: next, grabOffset: d.grabOffset }
        break
      }
      case 'overlay-start': {
        const end = d.overlay.end > 0 ? d.overlay.end : duration
        onResizeOverlay(d.overlay.id, { start: clamp(point(t, e, [d.overlay.start, end]), 0, end - MIN_OVERLAY_LENGTH) })
        break
      }
      case 'overlay-end': {
        const originalEnd = d.overlay.end > 0 ? d.overlay.end : duration
        const end = clamp(point(t, e, [d.overlay.start, originalEnd]), d.overlay.start + MIN_OVERLAY_LENGTH, duration)
        onResizeOverlay(d.overlay.id, { end: end >= duration - 1e-3 ? 0 : end })
        break
      }
    }
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    drag.current = null
    setSnapGuide(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (d && d.mode === 'maybe-add') onAddSegment(d.t)
    if (d && d.mode === 'seg-maybe-move') onSeek(xToTime(localX(e).x, duration, width))
  }

  const x = (t: number) => timeToX(t, duration, width)
  const laneTop = RULER_H + GAP
  const overlayLaneTop = laneTop + LANE_H + GAP
  const clipLaneTop = overlayLaneTop + OVERLAY_LANE_H + GAP
  const removedClips = clips.filter((c) => c.removed)
  const boundaries = clips.slice(1).map((c) => c.start)

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height: HEIGHT, cursor: ready ? cursor : 'default', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => !drag.current && setCursor('default')}
      role="group"
      aria-label="Timeline"
    >
      {snapGuide !== null && (
        <div className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-auto" style={{ left: x(snapGuide) }} aria-hidden="true">
          <span className="absolute left-1 top-0 rounded-[3px] bg-auto px-1 py-0.5 font-mono text-[9px] text-accent-fg">{formatTime(snapGuide)}</span>
        </div>
      )}
      {/* Ruler */}
      <div className="absolute left-0 right-0 top-0 overflow-hidden" style={{ height: RULER_H }}>
        {ready &&
          (pauses ?? []).map((p, i) => (
            <div
              key={`pause-${i}`}
              className="absolute top-0 h-full w-[3px] -translate-x-1/2 rounded-b-[2px] bg-[#ffb547]"
              style={{ left: x(p.t) }}
              title={`Paused here for ${Math.round(p.durationSec)} s. The video jumps, consider a cut.`}
            />
          ))}
        {ticks.map(({ t, major }) => (
          <div key={t} className="absolute bottom-0" style={{ left: x(t) }}>
            <div className={cx('w-px', major ? 'h-2 bg-fg-dim' : 'h-1 bg-line-strong')} />
            {major && (
              <div className="absolute bottom-[10px] left-0 -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] tabular-nums text-fg-dim">
                {formatTime(t, { fraction: pickStep(duration, width) < 1 })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Overlay lane */}
      <div className="absolute left-0 right-0 rounded-[6px] border border-line bg-bg-1" style={{ top: overlayLaneTop, height: OVERLAY_LANE_H }}>
        {ready && overlays.length === 0 && (
          <div className="pointer-events-none flex h-full items-center justify-center text-[10.5px] text-fg-dim">Overlays appear here</div>
        )}
        {ready &&
          overlays.map((o) => {
            const end = o.end > 0 ? Math.min(o.end, duration) : duration
            const left = x(o.start)
            const w = Math.max(2, x(end) - left)
            const selected = o.id === selectedOverlayId
            return (
              <div
                key={o.id}
                className={cx(
                  'absolute top-[3px] bottom-[3px] overflow-hidden rounded-[4px] border border-overlay/65 bg-overlay-soft transition-[filter] duration-100',
                  selected && 'ring-1 ring-fg brightness-125'
                )}
                style={{ left, width: w }}
                title={`${o.kind} overlay, ${formatTime(o.start)} to ${formatTime(end)}`}
              >
                <div className="absolute inset-y-0 left-0 w-[3px] bg-overlay/80" />
                <div className="absolute inset-y-0 right-0 w-[3px] bg-overlay/80" />
                {w > 44 && <div className="absolute inset-0 flex items-center justify-center truncate px-1.5 text-[9.5px] text-overlay">{o.kind === 'emoji' ? o.content : o.kind}</div>}
              </div>
            )
          })}
      </div>

      {/* Zoom lane */}
      <div
        className="absolute left-0 right-0 rounded-[6px] border border-line bg-bg-1"
        style={{ top: laneTop, height: LANE_H }}
      >
        {!ready && <div className="flex h-full items-center justify-center text-[11px] text-fg-dim">Loading timeline</div>}
        {ready && segments.length === 0 && (
          <div className="pointer-events-none flex h-full items-center justify-center text-[11px] text-fg-dim">Click to add a zoom</div>
        )}
        {ready &&
          segments.map((s) => {
            const left = x(s.start)
            const w = Math.max(2, x(s.end) - left)
            const selected = s.id === selectedId
            const manual = s.source === 'manual'
            return (
              <div
                key={s.id}
                className={cx(
                  'absolute top-[3px] bottom-[3px] overflow-hidden rounded-[4px] border transition-[filter] duration-100',
                  manual ? 'border-manual/70 bg-manual-soft' : 'border-auto/60 bg-auto-soft',
                  selected && 'ring-1 ring-fg brightness-125'
                )}
                style={{ left, width: w }}
                title={`${manual ? 'Manual' : 'Auto'} ${styleLabel(s.style)} ${s.scale.toFixed(1)}x, ${formatTime(s.start)} to ${formatTime(s.end)}. Drag to move, drag an edge to resize.`}
              >
                <div className={cx('absolute left-0 top-0 bottom-0 w-[3px]', manual ? 'bg-manual/80' : 'bg-auto/80')} />
                <div className={cx('absolute right-0 top-0 bottom-0 w-[3px]', manual ? 'bg-manual/80' : 'bg-auto/80')} />
                {w > 40 && (
                  <div className={cx('absolute inset-0 flex items-center justify-center font-mono text-[10px] tabular-nums', manual ? 'text-manual' : 'text-auto')}>
                    {styleGlyph(s.style)}{s.scale.toFixed(1)}x
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {/* Clip lane */}
      <div className="absolute left-0 right-0 rounded-[6px] border border-line bg-bg-1" style={{ top: clipLaneTop, height: CLIP_LANE_H }} data-testid="clip-lane">
        {ready && clips.length <= 1 && removedClips.length === 0 && (
          <div className="pointer-events-none flex h-full items-center justify-center text-[10.5px] text-fg-dim">Press S to split at the playhead, then Delete to remove a clip</div>
        )}
        {ready &&
          (clips.length > 1 || removedClips.length > 0) &&
          clips.map((c, i) => {
            const left = x(c.start)
            const w = Math.max(2, x(c.end) - left)
            const selected = c.id === selectedClipId
            return (
              <div
                key={c.id}
                data-clip={c.id}
                data-removed={c.removed || undefined}
                className={cx(
                  'absolute top-[3px] bottom-[3px] overflow-hidden rounded-[4px] border transition-[filter] duration-100',
                  c.removed ? 'border-dashed border-[#ff6b6b]/70 bg-[repeating-linear-gradient(135deg,rgba(255,107,107,0.22)_0_4px,transparent_4px_8px)]' : 'border-line-strong bg-bg-3',
                  selected && 'ring-1 ring-fg brightness-125'
                )}
                style={{ left: left + 1, width: Math.max(1, w - 2) }}
                title={`Clip ${i + 1}, ${formatTime(c.start)} to ${formatTime(c.end)}${c.removed ? ' (removed)' : ''}. Click to select.`}
              >
                {w > 56 && (
                  <div className={cx('absolute inset-0 flex items-center justify-center truncate px-1.5 font-mono text-[9.5px] tabular-nums', c.removed ? 'text-[#ff8a8a] line-through' : 'text-fg-muted')}>
                    {c.removed ? 'removed' : `${i + 1} · ${formatTime(c.end - c.start, { fraction: true })}`}
                  </div>
                )}
              </div>
            )
          })}
      </div>

      {ready && (
        <>
          {/* Removed clips dim every lane above them */}
          {removedClips.map((c) => (
            <div
              key={`cut-${c.id}`}
              className="pointer-events-none absolute bg-[repeating-linear-gradient(135deg,rgba(255,107,107,0.16)_0_4px,transparent_4px_8px)]"
              style={{ left: x(c.start), width: Math.max(1, x(c.end) - x(c.start)), top: laneTop, height: clipLaneTop - laneTop - GAP }}
            />
          ))}
          {/* Split marks */}
          {boundaries.map((t) => (
            <div key={`split-${t}`} className="pointer-events-none absolute w-px bg-[#ff6b6b]/80" style={{ left: x(t), top: RULER_H - 6, bottom: 0 }}>
              <div className="absolute -left-[3px] top-0 h-[6px] w-[7px] rounded-[1px] bg-[#ff6b6b]" />
            </div>
          ))}

          {/* Trimmed-away shading */}
          <div className="pointer-events-none absolute top-0 bottom-0 left-0 bg-bg-0/70" style={{ width: x(trim.start) }} />
          <div className="pointer-events-none absolute top-0 bottom-0 right-0 bg-bg-0/70" style={{ width: Math.max(0, width - x(trim.end)) }} />

          {/* Trim handles */}
          {(['start', 'end'] as const).map((k) => (
            <div
              key={k}
              className="pointer-events-none absolute flex flex-col items-center justify-center gap-[2px] rounded-[3px] bg-fg shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{ left: x(trim[k]) - 5, width: 10, top: handleTop, height: handleBottom - handleTop }}
              aria-hidden="true"
            >
              <span className="h-2.5 w-px bg-bg-0/60" />
            </div>
          ))}

          {/* Playhead */}
          <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-fg" style={{ left: x(time) }}>
            <div className="absolute -left-[4px] top-0 h-0 w-0 border-l-[4.5px] border-r-[4.5px] border-t-[6px] border-l-transparent border-r-transparent border-t-fg" />
          </div>
        </>
      )}
    </div>
  )
})
