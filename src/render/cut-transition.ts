// Draws the transition that hides a removed clip. See shared/cut-transition.ts
// for the timing; this file only turns a progress value into pixels, so the
// preview canvas and the export's OffscreenCanvas get the same picture.

import { heldOpacity, transitionBlurPx, type CutTransitionStyle } from '../shared/cut-transition'
import { scratchCanvas } from './scratch-canvas'
import type { Ctx2D } from './render-frame'

/** Below this the held frame contributes nothing a viewer could see. */
const ALPHA_FLOOR = 0.004
/** Below half a pixel the blur filter costs a full-frame pass for nothing. */
const BLUR_FLOOR = 0.5

/**
 * Copy the composed frame so it can be held over the frames after a join.
 * Scoped to `ctx`, so preview pixels never reach an export canvas.
 */
export function holdFrame(ctx: Ctx2D): OffscreenCanvas | null {
  const { width, height } = ctx.canvas
  if (!(width > 0) || !(height > 0)) return null
  if (typeof OffscreenCanvas === 'undefined') return null
  const canvas = scratchCanvas(ctx, 'cut-held', width, height)
  const held = canvas.getContext('2d')
  if (!held) return null
  held.clearRect(0, 0, width, height)
  held.drawImage(ctx.canvas as CanvasImageSource, 0, 0)
  return canvas
}

/**
 * Composite the held frame over the one just rendered. 'blur' additionally
 * softens the pair; the softened image is drawn overscanned by the blur radius
 * so the filter never pulls transparent pixels in from outside the frame and
 * darkens the border.
 */
export function drawCutTransition(ctx: Ctx2D, held: CanvasImageSource, progress: number, style: CutTransitionStyle): void {
  if (style === 'none') return
  const { width, height } = ctx.canvas
  if (!(width > 0) || !(height > 0)) return
  const alpha = heldOpacity(progress)

  if (style === 'dissolve') {
    if (alpha <= ALPHA_FLOOR) return
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.drawImage(held, 0, 0, width, height)
    ctx.restore()
    return
  }

  const blur = transitionBlurPx(progress, Math.min(width, height))
  if (alpha <= ALPHA_FLOOR && blur < BLUR_FLOOR) return
  if (typeof OffscreenCanvas === 'undefined') {
    // No scratch surface: fall back to the plain dissolve rather than nothing.
    if (alpha > ALPHA_FLOOR) drawCutTransition(ctx, held, progress, 'dissolve')
    return
  }
  const scratch = scratchCanvas(ctx, 'cut-blur', width, height)
  const pair = scratch.getContext('2d')
  if (!pair) return
  pair.clearRect(0, 0, width, height)
  pair.drawImage(ctx.canvas as CanvasImageSource, 0, 0)
  if (alpha > ALPHA_FLOOR) {
    pair.save()
    pair.globalAlpha = alpha
    pair.drawImage(held, 0, 0, width, height)
    pair.restore()
  }
  const grow = blur >= BLUR_FLOOR ? blur * 3 : 0
  ctx.save()
  if (blur >= BLUR_FLOOR) ctx.filter = `blur(${blur.toFixed(2)}px)`
  ctx.drawImage(scratch, -grow, -grow, width + grow * 2, height + grow * 2)
  ctx.restore()
}
