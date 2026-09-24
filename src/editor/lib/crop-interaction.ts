import type { Crop } from '../../shared/types'

export const MIN_CROP_SIZE = 0.01

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

export function cropFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): Crop {
  const x = clamp01(Math.min(start.x, end.x))
  const y = clamp01(Math.min(start.y, end.y))
  const right = clamp01(Math.max(start.x, end.x))
  const bottom = clamp01(Math.max(start.y, end.y))
  return cropFromBounds(x, y, right, bottom)
}

export function cropFromBounds(x: number, y: number, right: number, bottom: number): Crop {
  let left = clamp01(Math.min(x, right))
  let top = clamp01(Math.min(y, bottom))
  let r = clamp01(Math.max(x, right))
  let b = clamp01(Math.max(y, bottom))
  if (r - left < MIN_CROP_SIZE) {
    const mid = (left + r) / 2
    left = clamp01(mid - MIN_CROP_SIZE / 2)
    r = Math.min(1, left + MIN_CROP_SIZE)
    left = Math.max(0, r - MIN_CROP_SIZE)
  }
  if (b - top < MIN_CROP_SIZE) {
    const mid = (top + b) / 2
    top = clamp01(mid - MIN_CROP_SIZE / 2)
    b = Math.min(1, top + MIN_CROP_SIZE)
    top = Math.max(0, b - MIN_CROP_SIZE)
  }
  return { x: left, y: top, width: r - left, height: b - top }
}

export function cropFromPointer(start: { x: number; y: number }, point: { x: number; y: number }): Crop {
  return cropFromPoints(start, point)
}

export function moveCrop(crop: Crop, dx: number, dy: number): Crop {
  const x = Math.min(1 - crop.width, Math.max(0, crop.x + dx))
  const y = Math.min(1 - crop.height, Math.max(0, crop.y + dy))
  return { ...crop, x, y }
}

/** Which sides of the crop a resize gesture drags. */
export interface CropEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

export type CropGesture = { mode: 'draw' } | { mode: 'move' } | { mode: 'resize'; edges: CropEdges }

/**
 * What a press at `p` does. Corners and edges resize; inside moves; anywhere
 * else draws a new rectangle. `tolerance` is the grab distance in the same
 * normalised units, per axis, so it stays a fixed number of screen pixels.
 *
 * A selection that fills the frame cannot move, and an uncropped take starts
 * that way: treating a press inside it as a move made cropping impossible to
 * start. Inside such a selection a press draws instead.
 */
export function cropGestureAt(p: { x: number; y: number }, crop: Crop, tolerance: { x: number; y: number }): CropGesture {
  const right = crop.x + crop.width
  const bottom = crop.y + crop.height
  const withinY = p.y >= crop.y - tolerance.y && p.y <= bottom + tolerance.y
  const withinX = p.x >= crop.x - tolerance.x && p.x <= right + tolerance.x
  const edges: CropEdges = {
    left: withinY && Math.abs(p.x - crop.x) <= tolerance.x,
    right: withinY && Math.abs(p.x - right) <= tolerance.x,
    top: withinX && Math.abs(p.y - crop.y) <= tolerance.y,
    bottom: withinX && Math.abs(p.y - bottom) <= tolerance.y
  }
  // A crop narrower than two grab zones would claim both sides; keep the nearer.
  if (edges.left && edges.right) Math.abs(p.x - crop.x) <= Math.abs(p.x - right) ? (edges.right = false) : (edges.left = false)
  if (edges.top && edges.bottom) Math.abs(p.y - crop.y) <= Math.abs(p.y - bottom) ? (edges.bottom = false) : (edges.top = false)
  if (edges.left || edges.right || edges.top || edges.bottom) return { mode: 'resize', edges }
  const inside = p.x > crop.x && p.x < right && p.y > crop.y && p.y < bottom
  const canMove = crop.width < 1 - 1e-6 || crop.height < 1 - 1e-6
  return inside && canMove ? { mode: 'move' } : { mode: 'draw' }
}

/** Drag the chosen sides by (dx, dy), keeping the crop inside the frame and at least MIN_CROP_SIZE. */
export function resizeCrop(crop: Crop, edges: CropEdges, dx: number, dy: number): Crop {
  let left = crop.x
  let top = crop.y
  let right = crop.x + crop.width
  let bottom = crop.y + crop.height
  if (edges.left) left = Math.min(clamp01(left + dx), right - MIN_CROP_SIZE)
  if (edges.right) right = Math.max(clamp01(right + dx), left + MIN_CROP_SIZE)
  if (edges.top) top = Math.min(clamp01(top + dy), bottom - MIN_CROP_SIZE)
  if (edges.bottom) bottom = Math.max(clamp01(bottom + dy), top + MIN_CROP_SIZE)
  return cropFromBounds(left, top, right, bottom)
}

/** CSS cursor for what a press at this spot would do. */
export function cropCursor(gesture: CropGesture): string {
  if (gesture.mode === 'move') return 'move'
  if (gesture.mode === 'draw') return 'crosshair'
  const { left, right, top, bottom } = gesture.edges
  if ((left && top) || (right && bottom)) return 'nwse-resize'
  if ((right && top) || (left && bottom)) return 'nesw-resize'
  return left || right ? 'ew-resize' : 'ns-resize'
}
