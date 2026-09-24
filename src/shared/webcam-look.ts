/**
 * Webcam look: framing, studio lighting, and what sits behind the person.
 *
 * All of this is a pure function of the settings, so it lives here rather than
 * in the renderer — the preview and the export both call the same maths, and it
 * can be unit tested without a canvas.
 */

/** What replaces the real room behind the subject. Needs segmentation for every value but 'none'. */
export type WebcamBackdrop = 'none' | 'blur' | 'color' | 'scene'

export interface WebcamLook {
  /** 1 is the full sensor frame; above that crops in. The honest version of "change the angle". */
  zoom: number
  /** Pan within the source frame, -1 to 1, applied after zoom. 0 is centred. */
  offsetX: number
  offsetY: number
  /** Backdrop behind the subject. */
  backdrop: WebcamBackdrop
  /** Blur radius in output px at backdrop 'blur'. */
  blur: number
  /** Fill at backdrop 'color'. */
  color: string
  /** Key light strength, 0 disables the whole lighting pass. */
  light: number
  /** Where the key light comes from, degrees clockwise from twelve o'clock. */
  lightAngle: number
  /** Rim light on the side opposite the key. */
  rim: number
  /** Exposure lift, -1 to 1. */
  exposure: number
  /** Contrast, 1 is untouched. */
  contrast: number
}

export const DEFAULT_WEBCAM_LOOK: WebcamLook = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  backdrop: 'none',
  blur: 18,
  color: '#12171c',
  light: 0,
  lightAngle: 315,
  rim: 0,
  exposure: 0,
  contrast: 1
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export interface SourceSize {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The slice of the camera frame to draw into `dest`.
 *
 * Cover-fits the source to the destination first — a 16:9 sensor in a circular
 * bubble must fill it, not letterbox — then crops by `zoom` and pans by the
 * offsets. Panning is clamped so the crop can never leave the sensor, which is
 * what stops a hard black edge appearing at the extremes.
 */
export function sourceCrop(src: SourceSize, dest: SourceSize, look: Pick<WebcamLook, 'zoom' | 'offsetX' | 'offsetY'>): Rect {
  if (!(src.width > 0) || !(src.height > 0) || !(dest.width > 0) || !(dest.height > 0)) {
    return { x: 0, y: 0, width: Math.max(0, src.width), height: Math.max(0, src.height) }
  }
  const zoom = clamp(look.zoom, 1, 4)
  const destAspect = dest.width / dest.height
  const srcAspect = src.width / src.height

  // cover fit: take the largest centred slice of the source with the destination's aspect
  let width = srcAspect > destAspect ? src.height * destAspect : src.width
  let height = srcAspect > destAspect ? src.height : src.width / destAspect
  width /= zoom
  height /= zoom

  const freeX = src.width - width
  const freeY = src.height - height
  const x = (freeX / 2) * (1 + clamp(look.offsetX, -1, 1))
  const y = (freeY / 2) * (1 + clamp(look.offsetY, -1, 1))
  return { x, y, width, height }
}

/** Unit vector for the key light. 0 degrees is straight down from the top. */
export function lightVector(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad) }
}

/** Canvas filter string for exposure and contrast; empty when both are neutral. */
export function toneFilter(look: Pick<WebcamLook, 'exposure' | 'contrast'>): string {
  const exposure = clamp(look.exposure, -1, 1)
  const contrast = clamp(look.contrast, 0.5, 2)
  const parts: string[] = []
  if (exposure !== 0) parts.push(`brightness(${(1 + exposure * 0.55).toFixed(3)})`)
  if (contrast !== 1) parts.push(`contrast(${contrast.toFixed(3)})`)
  return parts.join(' ')
}

/** True when the look needs a person mask; segmentation is skipped entirely otherwise. */
export function needsSegmentation(look: Pick<WebcamLook, 'backdrop'>): boolean {
  return look.backdrop !== 'none'
}
