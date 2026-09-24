// Camera (pan/zoom/tilt) state as a pure function of time. Pure, no DOM.
import type { Camera, CameraStyle, ZoomSegment } from './types'

export interface CameraConfig {
  /** Seconds to ease into and out of a segment. */
  easeSec: number
  /** 0..1, how far the focus drifts from the segment focus toward the pointer. */
  follow: number
}

export const DEFAULT_CAMERA: CameraConfig = { easeSec: 0.6, follow: 0.35 }

/** Degrees of perspective for the tilt styles. Beyond ~15 the strip renderer starts to show. */
export const TILT_DEG = 11
/** Ease-in for the punch style, seconds. */
export const PUNCH_EASE_SEC = 0.12
/** Drift starts this far below the segment scale and settles on it by the end. */
export const DRIFT_START_FACTOR = 0.86

type Point = { x: number; y: number }
type Size = { width: number; height: number }

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Cubic ease-in-out on [0, 1]. */
export function easeInOutCubic(p: number): number {
  const t = clamp(p, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function styleOf(seg: Pick<ZoomSegment, 'style'>): CameraStyle {
  return seg.style ?? 'zoom'
}

/** Tilt angles a style asks for, degrees. tiltX > 0 brings the left edge closer, tiltY > 0 the top edge. */
export function tiltFor(style: CameraStyle): { tiltX: number; tiltY: number } {
  switch (style) {
    case 'tilt-left':
      return { tiltX: TILT_DEG, tiltY: 0 }
    case 'tilt-right':
      return { tiltX: -TILT_DEG, tiltY: 0 }
    case 'tilt-up':
      return { tiltX: 0, tiltY: TILT_DEG * 0.8 }
    case 'tilt-down':
      return { tiltX: 0, tiltY: -TILT_DEG * 0.8 }
    default:
      return { tiltX: 0, tiltY: 0 }
  }
}

function centered(region: Size): Camera {
  return { cx: region.width / 2, cy: region.height / 2, scale: 1, tiltX: 0, tiltY: 0 }
}

/** Keep the visible viewport (region / scale, centred on cx,cy) inside the region. Tilt passes through. */
export function clampCamera(cam: Camera, region: Size): Camera {
  const scale = cam.scale > 0 ? cam.scale : 1
  const halfW = region.width / scale / 2
  const halfH = region.height / scale / 2
  const cx = halfW >= region.width / 2 ? region.width / 2 : clamp(cam.cx, halfW, region.width - halfW)
  const cy = halfH >= region.height / 2 ? region.height / 2 : clamp(cam.cy, halfH, region.height - halfH)
  return { cx, cy, scale: cam.scale, tiltX: cam.tiltX ?? 0, tiltY: cam.tiltY ?? 0 }
}

/** Scale a segment asks for at `tSec`: constant, except `drift`, which pushes in over its length. */
export function scaleAt(seg: ZoomSegment, tSec: number): number {
  if (styleOf(seg) !== 'drift') return seg.scale
  const len = Math.max(seg.end - seg.start, 1e-6)
  const p = clamp((tSec - seg.start) / len, 0, 1)
  const from = Math.max(1, seg.scale * DRIFT_START_FACTOR)
  return from + (seg.scale - from) * p
}

/**
 * How far a settled zoom leans from "clicked spot stays where it was" toward
 * "clicked spot in the middle". 0 keeps the spot fixed on screen, which leaves
 * no room around clicks near an edge; 1 slides everything to the centre.
 */
export const CENTER_PULL = 0.3

/**
 * Where the camera settles for a segment. The zoom grows out of the focus
 * point (the click): a point zoomed about itself stays put on screen, so the
 * framing is `focus + (centre - focus) / scale`, eased CENTER_PULL of the way
 * toward centring the focus.
 */
function targetFor(seg: ZoomSegment, tSec: number, pointer: Point | null, region: Size, follow: number): Camera {
  let fx = seg.x
  let fy = seg.y
  if (pointer) {
    fx += (pointer.x - seg.x) * follow
    fy += (pointer.y - seg.y) * follow
  }
  const scale = scaleAt(seg, tSec)
  const inv = 1 / Math.max(scale, 1)
  const anchoredX = fx + (region.width / 2 - fx) * inv
  const anchoredY = fy + (region.height / 2 - fy) * inv
  let cx = anchoredX + (fx - anchoredX) * CENTER_PULL
  let cy = anchoredY + (fy - anchoredY) * CENTER_PULL
  const tilt = tiltFor(styleOf(seg))
  const progress = clamp((tSec - seg.start) / Math.max(seg.end - seg.start, 1e-6), 0, 1)
  if (seg.style === 'pan-left' || seg.style === 'pan-right') {
    const direction = seg.style === 'pan-left' ? -1 : 1
    cx += direction * (easeInOutCubic(progress) - 0.5) * region.width * 0.18
  }
  if (seg.style === 'orbit') {
    tilt.tiltX = Math.sin((progress - 0.5) * Math.PI) * TILT_DEG
    tilt.tiltY = Math.sin(progress * Math.PI) * TILT_DEG * 0.35
  }
  return clampCamera({ cx, cy, scale, ...tilt }, region)
}

function isSorted(segments: ReadonlyArray<ZoomSegment>): boolean {
  for (let i = 1; i < segments.length; i++) if (segments[i].start < segments[i - 1].start) return false
  return true
}

/** Zooming back out takes this much longer than zooming in, so the return feels unhurried. */
export const OUT_SLOWDOWN = 1.35

/** Response time multiplier: a critically damped spring is ~95% of the way there after 4.74 / omega. */
const SETTLE = 4.74
/** Neighbouring zooms closer than this stay zoomed in and pan across instead of pumping out and back in. */
export const HOLD_GAP_SEC = 1.2
/** The zoom-out starts this fraction of easeSec before a segment ends, so the glide is centred on the end. */
export const OUT_LEAD_FRACTION = 0.5
const OUT_LEAD = OUT_LEAD_FRACTION
/** Damping for the `spring` style: a soft overshoot that settles. 1 = no overshoot. */
const SPRING_STYLE_DAMPING = 0.45
/** Path resolution. Rendered frames interpolate between samples. */
const SAMPLE_HZ = 120
const SUBSTEPS = 4

export type PointerSource = Point | null | ((tSec: number) => Point | null)

interface Intent {
  seg: ZoomSegment | null
  omega: number
  damping: number
}

/** Which segment the camera is heading for at `tSec`, and how briskly. */
function intentAt(tSec: number, segs: ReadonlyArray<ZoomSegment>, easeSec: number): Intent {
  const base = SETTLE / Math.max(easeSec, 1e-3)
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const next = segs[i + 1]
    const len = s.end - s.start
    const holds = next !== undefined && next.start - s.end < HOLD_GAP_SEC
    const releaseAt = holds ? next.start : Math.max(s.start + len / 2, s.end - easeSec * OUT_LEAD)
    if (tSec >= s.start && tSec < releaseAt) {
      const style = styleOf(s)
      const punching = style === 'punch' && tSec < s.start + Math.max(easeSec, PUNCH_EASE_SEC)
      return {
        seg: s,
        omega: punching ? Math.max(base, SETTLE / PUNCH_EASE_SEC) : base,
        damping: style === 'spring' ? SPRING_STYLE_DAMPING : 1
      }
    }
  }
  return { seg: null, omega: base, damping: 1 }
}

/**
 * State layout per sample: ln(scale), anchorX, anchorY, tiltX, tiltY.
 *
 * The camera is described by its scale and the source point it zooms about
 * (the anchor), not by its centre. Zooming about a fixed anchor keeps that
 * point still on screen, so a zoom-in grows out of the clicked spot and a
 * zoom-out shrinks back into it instead of sliding sideways. At full frame
 * the anchor has no visible effect, which lets it jump to the next click for
 * free before the next zoom begins.
 */
const DIM = 5

/** Camera centre along one axis for a scale and an anchor. */
function centreFromAnchor(anchor: number, size: number, scale: number): number {
  return anchor + (size / 2 - anchor) / Math.max(scale, 1)
}

/** The anchor that yields `centre` at `scale`; undefined at full frame, where every anchor gives the same view. */
function anchorFromCentre(centre: number, size: number, scale: number): number | undefined {
  const inv = 1 / scale
  if (!(scale > 1 + 1e-6)) return undefined
  return (centre - (size / 2) * inv) / (1 - inv)
}

export interface CameraPath {
  at(tSec: number): Camera
}

/**
 * Precompute how the camera moves through the whole recording.
 *
 * The camera is a spring chasing a target: the active segment's focus (blended
 * toward the pointer by `follow`) or the centred full frame. That gives the
 * Screen Studio feel: a quick start, a long gentle settle, and no restart or
 * speed jump when the target changes mid-move. Scale is sprung in log space,
 * so 1x to 2x looks as even as 2x to 4x. Zooms closer than HOLD_GAP_SEC pan
 * straight across without zooming out in between.
 *
 * Sampled once at SAMPLE_HZ and interpolated, so a frame depends only on its
 * time: preview, seeking and export all see the same camera.
 */
export function buildCameraPath(
  segments: ReadonlyArray<ZoomSegment>,
  pointer: PointerSource,
  region: Size,
  cfg: Partial<CameraConfig> = {}
): CameraPath {
  const c: CameraConfig = { ...DEFAULT_CAMERA, ...cfg }
  const easeSec = Math.max(0, c.easeSec)
  const follow = clamp(c.follow, 0, 1)
  const home = centered(region)
  const sorted = isSorted(segments) ? segments : [...segments].sort((a, b) => a.start - b.start)
  // A later segment takes over at its start, not when an overlapping previous one ends.
  const segs = sorted
    .map((segment, i) => ({ ...segment, end: Math.min(segment.end, sorted[i + 1]?.start ?? Infinity) }))
    .filter((segment) => segment.end > segment.start && Number.isFinite(segment.start))
  if (segs.length === 0) return { at: () => home }

  const pointerAt = typeof pointer === 'function' ? pointer : () => pointer
  const targetAt = (t: number, seg: ZoomSegment | null): Camera =>
    seg ? targetFor(seg, t, follow > 0 ? pointerAt(t) : null, region, follow) : home

  const dt = 1 / SAMPLE_HZ
  const h = dt / SUBSTEPS
  const t0 = Math.max(0, segs[0].start - dt)
  const t1 = segs[segs.length - 1].end + Math.max(easeSec, 0.1) * 4 + 0.5
  const count = Math.ceil((t1 - t0) / dt) + 1
  const data = new Float64Array(count * DIM)
  const x = [0, home.cx, home.cy, 0, 0]
  const W = region.width
  const H = region.height
  const v = [0, 0, 0, 0, 0]
  const goal = [0, 0, 0, 0, 0]

  for (let n = 0; n < count; n++) {
    const t = t0 + n * dt
    // The target is sampled once per step (120 Hz is far finer than any
    // target change); the spring integrates in substeps for stability.
    const intent = intentAt(t, segs, easeSec)
    const target = targetAt(t, intent.seg)
    const targetScale = target.scale > 0 ? target.scale : 1
    goal[0] = Math.log(Math.max(1, targetScale))
    // Zooming out keeps the current anchor, so it retraces the zoom-in.
    goal[1] = anchorFromCentre(target.cx, W, targetScale) ?? x[1]
    goal[2] = anchorFromCentre(target.cy, H, targetScale) ?? x[2]
    goal[3] = target.tiltX ?? 0
    goal[4] = target.tiltY ?? 0
    // At rest at full frame, move the anchor straight to the next click: invisible, and
    // the zoom that follows then grows from exactly that spot.
    if (x[0] < 1e-4 && Math.abs(v[0]) < 1e-3) {
      x[1] = goal[1]
      x[2] = goal[2]
      v[1] = 0
      v[2] = 0
    }
    if (easeSec === 0) {
      for (let k = 0; k < DIM; k++) {
        x[k] = goal[k]
        v[k] = 0
        data[n * DIM + k] = goal[k]
      }
      continue
    }
    for (let k = 0; k < DIM; k++) data[n * DIM + k] = x[k]
    for (let sub = 0; sub < SUBSTEPS; sub++) {
      if (easeSec === 0) {
        for (let k = 0; k < DIM; k++) {
          x[k] = goal[k]
          v[k] = 0
        }
        continue
      }
      const w = intent.seg === null ? intent.omega / OUT_SLOWDOWN : intent.omega
      const zeta = intent.damping
      for (let k = 0; k < DIM; k++) {
        // Semi-implicit Euler: stable here since omega * h stays well under 1.
        v[k] += (w * w * (goal[k] - x[k]) - 2 * zeta * w * v[k]) * h
        x[k] += v[k] * h
      }
    }
  }

  const settledHome = (cam: Camera): boolean =>
    Math.abs(cam.scale - 1) < 1e-3 &&
    Math.abs(cam.cx - home.cx) < 0.5 &&
    Math.abs(cam.cy - home.cy) < 0.5 &&
    Math.abs(cam.tiltX ?? 0) < 0.01 &&
    Math.abs(cam.tiltY ?? 0) < 0.01

  return {
    at(tSec: number): Camera {
      if (!Number.isFinite(tSec) || tSec <= t0 || tSec >= t1) return home
      const f = (tSec - t0) / dt
      const i = Math.min(count - 2, Math.floor(f))
      const u = f - i
      const a = i * DIM
      const b = a + DIM
      const lerp = (k: number) => data[a + k] + (data[b + k] - data[a + k]) * u
      const scale = Math.exp(Math.max(0, lerp(0)))
      const cam: Camera = { cx: centreFromAnchor(lerp(1), W, scale), cy: centreFromAnchor(lerp(2), H, scale), scale, tiltX: lerp(3), tiltY: lerp(4) }
      if (intentAt(tSec, segs, easeSec).seg === null && settledHome(cam)) return home
      return clampCamera(cam, region)
    }
  }
}

// Paths are cached per segment list, since a frame is rendered many times per edit.
const pathCache = new WeakMap<ReadonlyArray<ZoomSegment>, Map<string, CameraPath>>()
const pointerIds = new WeakMap<object, number>()
let nextPointerId = 1
const PATHS_PER_SEGMENT_LIST = 8

function pointerKey(pointer: PointerSource): string {
  if (pointer === null) return 'none'
  if (typeof pointer === 'function') {
    let id = pointerIds.get(pointer)
    if (id === undefined) {
      id = nextPointerId++
      pointerIds.set(pointer, id)
    }
    return `fn${id}`
  }
  return `pt${pointer.x},${pointer.y}`
}

/**
 * Camera at `tSec`. See buildCameraPath for how it moves. `pointer` is either
 * a fixed point or a function of time; pass the same function (or the same
 * segment array) across frames so the path is built once.
 */
export function cameraAt(
  tSec: number,
  segments: ReadonlyArray<ZoomSegment>,
  pointer: PointerSource,
  region: Size,
  cfg: Partial<CameraConfig> = {}
): Camera {
  if (segments.length === 0) return centered(region)
  const c: CameraConfig = { ...DEFAULT_CAMERA, ...cfg }
  const key = `${region.width}x${region.height}|${c.easeSec}|${c.follow}|${pointerKey(pointer)}`
  let byKey = pathCache.get(segments)
  if (!byKey) {
    byKey = new Map()
    pathCache.set(segments, byKey)
  }
  let path = byKey.get(key)
  if (!path) {
    if (byKey.size >= PATHS_PER_SEGMENT_LIST) byKey.clear()
    path = buildCameraPath(segments, pointer, region, c)
    byKey.set(key, path)
  }
  return path.at(tSec)
}
