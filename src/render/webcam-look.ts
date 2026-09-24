import { lightVector, needsSegmentation, sourceCrop, toneFilter, type Rect, type WebcamLook } from '../shared/webcam-look'
import { segmentPerson, type MaskFrame } from './segmenter'
import { scratchCanvas } from './scratch-canvas'

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/**
 * Draws the camera into an already-clipped bubble: backdrop, then the subject,
 * then the light.
 *
 * The order matters. The backdrop has to be laid down first because replacing
 * it means covering the real room; the subject is punched out of the same frame
 * with the person mask and drawn over it; the light goes last so it falls on
 * both and the composite reads as one photograph rather than a cut-out on a
 * plate.
 *
 * Every step degrades on its own. No mask means the camera is drawn plainly, so
 * a failed segmenter costs the backdrop and nothing else.
 */

/** Scratch canvases are pooled: a bubble is redrawn every frame and allocation dominates otherwise. */
function scratch(owner: object, key: string, width: number, height: number): OffscreenCanvas {
  return scratchCanvas(owner, `webcam-${key}`, Math.ceil(width), Math.ceil(height))
}

function ctxOf(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  return ctx
}

/** Mask bytes to an alpha bitmap the compositor can multiply against. */
function maskToAlpha(mask: MaskFrame, owner: object): OffscreenCanvas {
  const canvas = scratch(owner, 'mask', mask.width, mask.height)
  const ctx = ctxOf(canvas)
  const image = ctx.createImageData(mask.width, mask.height)
  const out = image.data
  for (let i = 0, p = 0; i < mask.data.length; i += 1, p += 4) {
    // The selfie model emits a category index; anything non-zero is the subject.
    const on = mask.data[i] !== 0 ? 255 : 0
    out[p] = 255
    out[p + 1] = 255
    out[p + 2] = 255
    out[p + 3] = on
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function drawLight(ctx: Ctx2D, rect: Rect, look: WebcamLook): void {
  if (look.light <= 0 && look.rim <= 0) return
  const dir = lightVector(look.lightAngle)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const reach = Math.max(rect.width, rect.height)

  ctx.save()
  if (look.light > 0) {
    const key = ctx.createRadialGradient(cx + dir.x * reach * 0.42, cy + dir.y * reach * 0.42, 0, cx, cy, reach * 0.92)
    key.addColorStop(0, `rgba(255, 247, 232, ${(look.light * 0.5).toFixed(3)})`)
    key.addColorStop(1, 'rgba(255, 247, 232, 0)')
    ctx.globalCompositeOperation = 'soft-light'
    ctx.fillStyle = key
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  if (look.rim > 0) {
    // Opposite the key, tight to the edge: the separation light that lifts a
    // subject off its background.
    const rim = ctx.createRadialGradient(cx - dir.x * reach * 0.6, cy - dir.y * reach * 0.6, reach * 0.18, cx - dir.x * reach * 0.6, cy - dir.y * reach * 0.6, reach * 0.62)
    rim.addColorStop(0, `rgba(210, 232, 255, ${(look.rim * 0.42).toFixed(3)})`)
    rim.addColorStop(1, 'rgba(210, 232, 255, 0)')
    ctx.globalCompositeOperation = 'screen'
    ctx.fillStyle = rim
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  }
  ctx.restore()
}

export interface WebcamDrawInput {
  ctx: Ctx2D
  webcam: CanvasImageSource
  source: { width: number; height: number }
  /** Destination in output px. The caller has already clipped to the bubble shape. */
  rect: Rect
  look: WebcamLook
  /** Painted when backdrop is 'scene'; usually the project background already on the frame. */
  scene?: CanvasImageSource | null
}

export function drawWebcamLook(input: WebcamDrawInput): void {
  const { ctx, webcam, source, rect, look } = input
  if (!(rect.width > 0) || !(rect.height > 0) || !(source.width > 0) || !(source.height > 0)) return

  const crop = sourceCrop(source, rect, look)
  const tone = toneFilter(look)
  const mask = needsSegmentation(look) ? segmentPerson(webcam) : null

  if (!mask) {
    // Plain path: no backdrop, and no cost when the look does not ask for one.
    ctx.save()
    if (tone) ctx.filter = tone
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(webcam, crop.x, crop.y, crop.width, crop.height, rect.x, rect.y, rect.width, rect.height)
    ctx.restore()
    drawLight(ctx, rect, look)
    return
  }

  // 1. Backdrop.
  ctx.save()
  if (look.backdrop === 'color') {
    ctx.fillStyle = look.color
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
  } else if (look.backdrop === 'scene' && input.scene) {
    ctx.drawImage(input.scene, rect.x, rect.y, rect.width, rect.height)
  } else {
    // 'blur', and the fallback for 'scene' with nothing to paint: the room
    // itself, defocused, which keeps the colour of the real light in frame.
    ctx.filter = `blur(${Math.max(1, look.blur).toFixed(1)}px)`
    ctx.drawImage(webcam, crop.x, crop.y, crop.width, crop.height, rect.x, rect.y, rect.width, rect.height)
  }
  ctx.restore()

  // 2. Subject, punched out of the same frame.
  const layer = scratch(ctx, 'subject', rect.width, rect.height)
  const lctx = ctxOf(layer)
  lctx.clearRect(0, 0, layer.width, layer.height)
  lctx.imageSmoothingEnabled = true
  lctx.imageSmoothingQuality = 'high'
  if (tone) lctx.filter = tone
  lctx.drawImage(webcam, crop.x, crop.y, crop.width, crop.height, 0, 0, layer.width, layer.height)
  lctx.filter = 'none'
  lctx.globalCompositeOperation = 'destination-in'
  // The mask covers the whole sensor, so it is cropped exactly like the camera.
  const mx = (crop.x / source.width) * mask.width
  const my = (crop.y / source.height) * mask.height
  const mw = (crop.width / source.width) * mask.width
  const mh = (crop.height / source.height) * mask.height
  lctx.drawImage(maskToAlpha(mask, ctx), mx, my, mw, mh, 0, 0, layer.width, layer.height)
  lctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(layer, rect.x, rect.y)

  // 3. Light over the composite.
  drawLight(ctx, rect, look)
}
