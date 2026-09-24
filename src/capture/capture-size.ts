/** Minimum useful capture edge. Tiny PipeWire placeholder streams (observed
 * as 2x2 green video on Hyprland) must never become saved recordings. */
export const MIN_CAPTURE_EDGE = 64

/**
 * Size limits for getDisplayMedia. Without them Chromium picks a small default
 * and scales the source down to it: on a 3440x1440 monitor at 1.25x the whole
 * screen arrived as 2150x900 and a 1644x1288 window as 1148x900, so text was
 * soft before any zoom. Ceilings, never targets: a source is captured at its
 * own pixel size up to these limits and never scaled up.
 */
export const MAX_CAPTURE_WIDTH = 7680
export const MAX_CAPTURE_HEIGHT = 4320

export function displayVideoConstraints(fps: number): MediaTrackConstraints {
  return {
    frameRate: { ideal: fps, max: fps },
    width: { max: MAX_CAPTURE_WIDTH },
    height: { max: MAX_CAPTURE_HEIGHT }
  }
}

/** Keep a resized window proportional inside the recording's fixed frame. */
export const CAPTURE_SIZE_CHANGE_BEHAVIOR = 'contain' as const

/** Clip unavailable source pixels without enlarging the remaining pixels. */
export function captureCropRect(crop: { x: number; y: number; width: number; height: number }, source: { width: number; height: number }) {
  const x = Math.max(0, crop.x)
  const y = Math.max(0, crop.y)
  return {
    x, y,
    width: Math.max(0, Math.min(source.width, crop.x + crop.width) - x),
    height: Math.max(0, Math.min(source.height, crop.y + crop.height) - y),
    destinationX: x - crop.x,
    destinationY: y - crop.y
  }
}

export function captureSizeError(width: number, height: number): string | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_CAPTURE_EDGE || height < MIN_CAPTURE_EDGE) {
    return `Capture source reported ${width}\u00d7${height}. In the Wayland share dialog, select a real screen or window and try again.`
  }
  return null
}
