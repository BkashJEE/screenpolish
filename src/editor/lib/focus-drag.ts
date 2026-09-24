import { clampFocus } from './segments'

export interface FocusDragPoint {
  x: number
  y: number
}

export interface FocusDragRect {
  left: number
  top: number
  width: number
  height: number
}

export interface FocusSourceSize {
  width: number
  height: number
}

/**
 * Map a pointer position in an explicitly labelled, un-tilted full-source
 * thumbnail into recording source coordinates.
 *
 * `pointer` and `rect` use the same viewport coordinate space; `source` is the
 * recording's full pixel size. Invalid source dimensions produce the safe
 * source origin; invalid thumbnail dimensions map to the source centre, while
 * non-finite pointer values fall back through `clampFocus` to that centre. The
 * returned point is always finite and inside the non-negative source bounds.
 */
export function focusFromThumbnailPointer(
  pointer: FocusDragPoint,
  rect: FocusDragRect,
  source: FocusSourceSize
): FocusDragPoint {
  const sourceWidth = finitePositive(source.width) ? source.width : 0
  const sourceHeight = finitePositive(source.height) ? source.height : 0
  const rectWidth = finitePositive(rect.width) ? rect.width : 0
  const rectHeight = finitePositive(rect.height) ? rect.height : 0

  if (sourceWidth === 0 || sourceHeight === 0) {
    return { x: 0, y: 0 }
  }
  if (rectWidth === 0 || rectHeight === 0) {
    return clampFocus({ x: Number.NaN, y: Number.NaN }, { width: sourceWidth, height: sourceHeight })
  }

  const x = finite(pointer.x) && finite(rect.left)
    ? ((pointer.x - rect.left) / rectWidth) * sourceWidth
    : Number.NaN
  const y = finite(pointer.y) && finite(rect.top)
    ? ((pointer.y - rect.top) / rectHeight) * sourceHeight
    : Number.NaN

  return clampFocus({ x, y }, { width: sourceWidth, height: sourceHeight })
}

function finite(value: number): boolean {
  return Number.isFinite(value)
}

function finitePositive(value: number): boolean {
  return finite(value) && value > 0
}
