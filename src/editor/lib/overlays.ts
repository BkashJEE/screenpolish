// Overlay editing: defaults, immutable Project updates, canvas hit testing and
// drag math. Pure, tested. The renderer (src/render/overlays.ts) owns the
// geometry; this module works on the OverlayFrame it produces.

import type { Overlay, OverlayKind, OverlayShape, OverlayText, Project, ShapeKind } from '../../shared/types'
import type { OverlayFrame } from '../../render/overlays'
import { clamp } from './time'

export const DEFAULT_OVERLAY_LENGTH = 3
export const MIN_OVERLAY_LENGTH = 0.1
export const MIN_OVERLAY_W = 0.02
export const MAX_OVERLAY_W = 1
export const DEFAULT_FADE = 0.15
export const DEFAULT_W: Record<OverlayKind, number> = { emoji: 0.18, text: 0.4, image: 0.3, arrow: 0.16, box: 0.3, blur: 0.24 }

/** Starting look for each callout. Blur defaults to pixelate, which hides text more reliably. */
export const DEFAULT_SHAPES: Record<ShapeKind, OverlayShape> = {
  arrow: { color: '#ff3b30', thickness: 5, aspect: 0.32 },
  box: { color: '#ffcc00', thickness: 4, aspect: 0.56, fill: false },
  blur: { color: '#000000', thickness: 1, aspect: 0.4, mode: 'pixelate', amount: 8 }
}

export const SHAPE_COLORS = ['#ff3b30', '#ffcc00', '#34c759', '#0a84ff', '#bf5af2', '#ffffff', '#111111'] as const
/** Nudge steps as output fractions. */
export const NUDGE = 0.005
export const NUDGE_LARGE = 0.02

export const OVERLAY_FONTS = ['Segoe UI', 'Inter', 'Georgia', 'Consolas', 'Impact', 'Comic Sans MS', 'Courier Prime'] as const

export const DEFAULT_TEXT_STYLE: OverlayText = {
  font: 'Segoe UI',
  color: '#ffffff',
  outline: '#000000',
  outlineWidth: 8,
  weight: 800,
  align: 'center'
}

export const DEFAULT_TEXT_BACKGROUND = '#000000'

/** Hand-picked stickers for the picker grid: reactions, arrows, marks, objects. */
export const EMOJI_PICKS: readonly string[] = [
  '👉', '👈', '👆', '👇', '☝️', '✅', '❌', '⚠️',
  '⭐', '🌟', '✨', '🔥', '💡', '🎯', '🚀', '💯',
  '👍', '👎', '👏', '🙌', '🤝', '💪', '👀', '🧠',
  '😀', '😂', '🤣', '😍', '🤔', '😎', '🤯', '😱',
  '🥳', '😅', '🙃', '😴', '🤫', '🙈', '🎉', '🏆',
  '❤️', '💜', '💙', '💚', '🧡', '💛', '🖤', '🤍',
  '📌', '📍', '🔍', '🔑', '🔒', '🔔', '📣', '💬',
  '⏰', '📈', '📉', '💰', '🛠️', '⚙️', '🐛', '🤖'
]

let counter = 0
export function newOverlayId(): string {
  counter += 1
  return `o-${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * A new overlay centred on the frame, starting at the playhead and running for
 * DEFAULT_OVERLAY_LENGTH seconds (or to the end when that would pass it).
 */
export function createOverlay(args: { kind: OverlayKind; content: string; t: number; duration: number }): Overlay {
  const { kind, content, duration } = args
  const start = Math.max(0, Number.isFinite(args.t) ? args.t : 0)
  const hasDuration = Number.isFinite(duration) && duration > 0
  let end = start + DEFAULT_OVERLAY_LENGTH
  if (hasDuration && end >= duration - 1e-3) end = 0
  const overlay: Overlay = {
    id: newOverlayId(),
    kind,
    content,
    x: 0.5,
    y: 0.5,
    w: DEFAULT_W[kind],
    rotation: 0,
    start,
    end,
    pinned: false,
    fadeSec: DEFAULT_FADE
  }
  if (kind === 'text') overlay.text = { ...DEFAULT_TEXT_STYLE }
  if (kind === 'arrow' || kind === 'box' || kind === 'blur') {
    overlay.shape = { ...DEFAULT_SHAPES[kind] }
    // Callouts point at or hide something in the recording, so they follow the zoom.
    overlay.pinned = true
    // A redaction must never fade in: the secret would show for a few frames.
    if (kind === 'blur') overlay.fadeSec = 0
  }
  return overlay
}

/** Keep the centre on the frame and the width sane. */
export function clampOverlay(o: Overlay): Overlay {
  const x = clamp(o.x, 0, 1)
  const y = clamp(o.y, 0, 1)
  const w = clamp(o.w, MIN_OVERLAY_W, MAX_OVERLAY_W)
  const rotation = normalizeAngle(o.rotation)
  const start = Math.max(0, o.start)
  let end = o.end
  if (end > 0 && end < start + MIN_OVERLAY_LENGTH) end = start + MIN_OVERLAY_LENGTH
  const fadeSec = Math.max(0, o.fadeSec)
  if (x === o.x && y === o.y && w === o.w && rotation === o.rotation && start === o.start && end === o.end && fadeSec === o.fadeSec) return o
  return { ...o, x, y, w, rotation, start, end, fadeSec }
}

/** Wrap to (-180, 180]. */
export function normalizeAngle(deg: number): number {
  if (!Number.isFinite(deg)) return 0
  let a = ((deg + 180) % 360) - 180
  if (a <= -180) a += 360
  return Math.round(a * 100) / 100
}

export type OverlayPatch = Partial<Omit<Overlay, 'id' | 'kind'>>

export function addOverlay(project: Project, overlay: Overlay): Project {
  return { ...project, overlays: [...project.overlays, clampOverlay(overlay)] }
}

export function removeOverlay(project: Project, id: string): Project {
  if (!project.overlays.some((o) => o.id === id)) return project
  return { ...project, overlays: project.overlays.filter((o) => o.id !== id) }
}

/** Field-wise equality (text style compared by value) so no-op patches keep the reference and autosave stays quiet. */
export function overlayEquals(a: Overlay, b: Overlay): boolean {
  if (a === b) return true
  const keys = Object.keys({ ...a, ...b }) as Array<keyof Overlay>
  for (const k of keys) {
    if (k === 'text' || k === 'shape') {
      if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false
    } else if (!Object.is(a[k], b[k])) return false
  }
  return true
}

export function updateOverlay(project: Project, id: string, patch: OverlayPatch): Project {
  let changed = false
  const overlays = project.overlays.map((o) => {
    if (o.id !== id) return o
    const next = clampOverlay({ ...o, ...patch })
    if (overlayEquals(next, o)) return o
    changed = true
    return next
  })
  return changed ? { ...project, overlays } : project
}

/** Copy placed slightly down-right so it is visibly separate. */
export function duplicateOverlay(source: Overlay): Overlay {
  return clampOverlay({ ...source, id: newOverlayId(), x: source.x + 0.03, y: source.y + 0.03, text: source.text ? { ...source.text } : undefined, shape: source.shape ? { ...source.shape } : undefined })
}

/** Short label for the list. */
export function overlayLabel(o: Overlay): string {
  if (o.kind === 'emoji') return o.content
  if (o.kind === 'arrow') return 'Arrow'
  if (o.kind === 'box') return 'Highlight box'
  if (o.kind === 'blur') return o.shape?.mode === 'blur' ? 'Blur' : 'Pixelate'
  if (o.kind === 'image') {
    const parts = o.content.split(/[\\/]/)
    return parts[parts.length - 1] || o.content
  }
  const first = o.content.split(/\r?\n/)[0]?.trim() ?? ''
  if (!first) return 'Text'
  return first.length > 24 ? `${first.slice(0, 23)}…` : first
}

// ---------------------------------------------------------------------------
// Canvas hit testing and drag math (all in output px)

export interface Point {
  x: number
  y: number
}

export type OverlayHit = { kind: 'body'; id: string } | { kind: 'handle'; id: string }

/** Rotate p about c by deg. */
function rotateAbout(p: Point, c: Point, deg: number): Point {
  if (!deg) return { x: p.x, y: p.y }
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Point in the overlay's local (unrotated, centre-origin) space. */
export function toLocal(frame: Pick<OverlayFrame, 'cx' | 'cy' | 'rotation'>, p: Point): Point {
  const u = rotateAbout(p, { x: frame.cx, y: frame.cy }, -frame.rotation)
  return { x: u.x - frame.cx, y: u.y - frame.cy }
}

export function pointInFrame(frame: Pick<OverlayFrame, 'cx' | 'cy' | 'width' | 'height' | 'rotation'>, p: Point, slackPx = 0): boolean {
  const l = toLocal(frame, p)
  return Math.abs(l.x) <= frame.width / 2 + slackPx && Math.abs(l.y) <= frame.height / 2 + slackPx
}

/** Bottom-right corner of the (rotated) box: where the resize/rotate handle sits. */
export function handlePoint(frame: Pick<OverlayFrame, 'cx' | 'cy' | 'width' | 'height' | 'rotation'>): Point {
  return rotateAbout({ x: frame.cx + frame.width / 2, y: frame.cy + frame.height / 2 }, { x: frame.cx, y: frame.cy }, frame.rotation)
}

/**
 * Topmost overlay under p. `frames` must be in draw order (layoutOverlays);
 * the selected overlay's handle wins over everything, then bodies from the top
 * of the stack down. Hidden frames (alpha 0) are skipped unless selected.
 */
export function hitTestOverlays(frames: readonly OverlayFrame[], p: Point, opts: { selectedId?: string | null; handlePx?: number } = {}): OverlayHit | null {
  const handlePx = opts.handlePx ?? 10
  const selected = opts.selectedId ? frames.find((f) => f.id === opts.selectedId) : undefined
  if (selected) {
    const h = handlePoint(selected)
    if (Math.hypot(p.x - h.x, p.y - h.y) <= handlePx) return { kind: 'handle', id: selected.id }
  }
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const f = frames[i]
    if (!(f.alpha > 0) && f.id !== opts.selectedId) continue
    if (pointInFrame(f, p)) return { kind: 'body', id: f.id }
  }
  return null
}

/** Move by a pointer delta: the centre shifts by the same output px. */
export function movedBy(start: Pick<Overlay, 'x' | 'y'>, delta: Point, output: { width: number; height: number }): { x: number; y: number } {
  return { x: clamp(start.x + delta.x / output.width, 0, 1), y: clamp(start.y + delta.y / output.height, 0, 1) }
}

/**
 * New width from dragging the bottom-right handle to p: the local x of p is
 * half the new width (the box keeps its centre and aspect). `pinScale` undoes
 * the camera zoom so pinned overlays resize in authored units.
 */
export function resizedTo(frame: Pick<OverlayFrame, 'cx' | 'cy' | 'rotation'>, p: Point, output: { width: number }, pinScale = 1): number {
  const l = toLocal(frame, p)
  const widthPx = Math.max(0, 2 * l.x) / (pinScale > 0 ? pinScale : 1)
  return clamp(widthPx / output.width, MIN_OVERLAY_W, MAX_OVERLAY_W)
}

/** Angle in degrees from the centre to p (0 = right, clockwise positive like canvas). */
export function angleTo(centre: Point, p: Point): number {
  return (Math.atan2(p.y - centre.y, p.x - centre.x) * 180) / Math.PI
}

/** Rotation after dragging from p0 to p1 around the centre, starting at startRotation. Snaps near multiples of 15° when `snap`. */
export function rotatedTo(centre: Point, p0: Point, p1: Point, startRotation: number, snap = false): number {
  let r = startRotation + angleTo(centre, p1) - angleTo(centre, p0)
  if (snap) {
    const near = Math.round(r / 15) * 15
    if (Math.abs(near - r) < 4) r = near
  }
  return normalizeAngle(r)
}

export function nudged(o: Pick<Overlay, 'x' | 'y'>, dx: number, dy: number): { x: number; y: number } {
  return { x: clamp(o.x + dx, 0, 1), y: clamp(o.y + dy, 0, 1) }
}

// ---------------------------------------------------------------------------
// Scrub-bar lane

export type LaneHit = { kind: 'start'; id: string } | { kind: 'end'; id: string } | { kind: 'body'; id: string } | { kind: 'empty'; t: number }

/** What lies under pixel x on the overlay lane. Edges win over bodies; later overlays win (they draw on top). */
export function hitTestOverlayLane(args: {
  x: number
  width: number
  duration: number
  overlays: readonly Overlay[]
  handlePx?: number
}): LaneHit {
  const { x, width, duration, overlays } = args
  const handlePx = args.handlePx ?? 5
  if (!(duration > 0) || !(width > 0)) return { kind: 'empty', t: 0 }
  const px = (t: number) => (t / duration) * width
  const t = clamp(x / width, 0, 1) * duration
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const o = overlays[i]
    const end = o.end > 0 ? Math.min(o.end, duration) : duration
    if (Math.abs(x - px(o.start)) <= handlePx) return { kind: 'start', id: o.id }
    if (Math.abs(x - px(end)) <= handlePx) return { kind: 'end', id: o.id }
  }
  for (let i = overlays.length - 1; i >= 0; i -= 1) {
    const o = overlays[i]
    const end = o.end > 0 ? Math.min(o.end, duration) : duration
    if (t >= o.start && t <= end) return { kind: 'body', id: o.id }
  }
  return { kind: 'empty', t }
}
