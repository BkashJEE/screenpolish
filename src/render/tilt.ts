// Fake perspective for the framed content. Canvas 2D has no 3D transform, so
// a tilted card is drawn as many thin strips, each scaled to the projected
// height (or width) at that position. Up to roughly 15 degrees this is
// indistinguishable from a real projection at video resolution, and it works
// identically in preview and export because both use this same code.

import type { Rect } from '../shared/layout'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export interface Point {
  x: number
  y: number
}

/** Projected corners of the card, clockwise from top-left, in output px. */
export interface CardQuad {
  tl: Point
  tr: Point
  br: Point
  bl: Point
}

export const DEFAULT_STRIPS = 96

/** Focal length relative to the larger card side; smaller = stronger perspective. */
export const FOCAL_FACTOR = 1.7

const rad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Project a card lying in the z=0 plane, centred on `rect`, rotated by
 * `tiltX` degrees about the vertical axis (positive brings the LEFT edge
 * toward the viewer) and `tiltY` degrees about the horizontal axis (positive
 * brings the TOP edge toward the viewer). Viewer sits on the -z side at
 * distance f, so points with z < 0 grow.
 */
export function projectCard(rect: Rect, tiltX: number, tiltY: number, focalFactor = FOCAL_FACTOR): CardQuad {
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const f = Math.max(rect.width, rect.height) * focalFactor
  const ay = rad(tiltX)
  const ax = rad(tiltY)
  const cosY = Math.cos(ay)
  const sinY = Math.sin(ay)
  const cosX = Math.cos(ax)
  const sinX = Math.sin(ax)

  const project = (x: number, y: number): Point => {
    // Rotate about Y: left edge (x < 0) moves toward the viewer (z < 0) for tiltX > 0.
    const x1 = x * cosY
    const z1 = x * sinY
    // Rotate about X: top edge (y < 0) moves toward the viewer for tiltY > 0.
    const y2 = y * cosX
    const z2 = z1 + y * sinX
    const k = f / (f + z2)
    return { x: cx + x1 * k, y: cy + y2 * k }
  }

  const hw = rect.width / 2
  const hh = rect.height / 2
  return {
    tl: project(-hw, -hh),
    tr: project(hw, -hh),
    br: project(hw, hh),
    bl: project(-hw, hh)
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Trace the projected outline (used for the shadow under a tilted card). */
export function quadPath(ctx: Ctx2D, q: CardQuad): void {
  ctx.beginPath()
  ctx.moveTo(q.tl.x, q.tl.y)
  ctx.lineTo(q.tr.x, q.tr.y)
  ctx.lineTo(q.br.x, q.br.y)
  ctx.lineTo(q.bl.x, q.bl.y)
  ctx.closePath()
}

export function hasTilt(tiltX?: number, tiltY?: number): boolean {
  return Math.abs(tiltX ?? 0) > 0.01 || Math.abs(tiltY ?? 0) > 0.01
}

/**
 * Draw `source` (an already rendered, rect-sized card with transparent
 * corners) onto `ctx` with the perspective described by the tilt angles.
 * Strips run vertically when the dominant tilt is about the vertical axis,
 * horizontally otherwise.
 */
export function drawTilted(
  ctx: Ctx2D,
  source: CanvasImageSource,
  sourceSize: { width: number; height: number },
  rect: Rect,
  tiltX: number,
  tiltY: number,
  strips = DEFAULT_STRIPS
): CardQuad {
  const q = projectCard(rect, tiltX, tiltY)
  const n = Math.max(1, Math.round(strips))
  const sw = sourceSize.width
  const sh = sourceSize.height
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (Math.abs(tiltX) >= Math.abs(tiltY)) {
    // Vertical strips: walk left to right. Each strip's top and bottom come from
    // the projected top and bottom edges at that fraction across the card.
    for (let i = 0; i < n; i++) {
      const u0 = i / n
      const u1 = (i + 1) / n
      const xa = lerp(q.tl.x, q.tr.x, u0)
      const xb = lerp(q.tl.x, q.tr.x, u1)
      const top = lerp(q.tl.y, q.tr.y, u0)
      const bottom = lerp(q.bl.y, q.br.y, u0)
      const dw = xb - xa
      // +0.6 px overlap hides seams between strips after smoothing.
      ctx.drawImage(source, u0 * sw, 0, Math.max(1, sw / n), sh, xa, top, dw + 0.6, bottom - top)
    }
  } else {
    for (let i = 0; i < n; i++) {
      const v0 = i / n
      const v1 = (i + 1) / n
      const ya = lerp(q.tl.y, q.bl.y, v0)
      const yb = lerp(q.tl.y, q.bl.y, v1)
      const left = lerp(q.tl.x, q.bl.x, v0)
      const right = lerp(q.tr.x, q.br.x, v0)
      const dh = yb - ya
      ctx.drawImage(source, 0, v0 * sh, sw, Math.max(1, sh / n), left, ya, right - left, dh + 0.6)
    }
  }
  ctx.restore()
  return q
}

/** Bounding box of a projected quad, for hit testing and shadow bounds. */
export function quadBounds(q: CardQuad): Rect {
  const xs = [q.tl.x, q.tr.x, q.br.x, q.bl.x]
  const ys = [q.tl.y, q.tr.y, q.br.y, q.bl.y]
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
