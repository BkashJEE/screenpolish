// Pure display/region geometry. Electron's Display is DIP; capture regions and
// the input log are physical px, so every conversion lives here and is tested.

import type { CaptureRegion } from '@shared/types'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The subset of Electron.Display these helpers need. */
export interface DisplayLike {
  id?: number
  bounds: Rect
  scaleFactor: number
}

/** Hardware H264 encoders want even dimensions; never go below 2. */
export function evenSize(n: number): number {
  const r = Math.round(n)
  return Math.max(2, r - (r % 2))
}

/** Whole display in physical px: DIP bounds × scaleFactor. */
export function regionForDisplay(display: DisplayLike): CaptureRegion {
  const s = display.scaleFactor > 0 ? display.scaleFactor : 1
  const b = display.bounds
  return {
    x: Math.round(b.x * s),
    y: Math.round(b.y * s),
    width: evenSize(b.width * s),
    height: evenSize(b.height * s),
    scale: s
  }
}

/**
 * Rectangle drawn on the overlay (CSS px relative to the display's top-left,
 * which is DIP on that display) → physical px on the virtual desktop.
 */
export function regionFromOverlayRect(display: DisplayLike, rect: Rect): CaptureRegion {
  const s = display.scaleFactor > 0 ? display.scaleFactor : 1
  const b = display.bounds
  return {
    x: Math.round((b.x + rect.x) * s),
    y: Math.round((b.y + rect.y) * s),
    width: evenSize(rect.width * s),
    height: evenSize(rect.height * s),
    scale: s
  }
}

/**
 * Crop rectangle inside the display stream for a region on that display.
 * Stream px are assumed to equal physical px (Chromium captures at native
 * resolution). Clamped to the display so a slightly-off region never yields a
 * negative or oversized crop.
 */
export function cropForRegion(region: CaptureRegion, displayRegion: CaptureRegion): Rect {
  const x = Math.max(0, Math.min(region.x - displayRegion.x, displayRegion.width - 2))
  const y = Math.max(0, Math.min(region.y - displayRegion.y, displayRegion.height - 2))
  const width = evenSize(Math.min(region.width, displayRegion.width - x))
  const height = evenSize(Math.min(region.height, displayRegion.height - y))
  return { x, y, width, height }
}

/** Physical bounds of a screen source that was reported in physical px (e.g. GetWindowRect). */
export function regionFromPhysicalRect(rect: Rect, scale: number): CaptureRegion {
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: evenSize(rect.width), height: evenSize(rect.height), scale }
}

/** Find the display whose physical bounds contain the point, else null. */
export function displayContaining<T extends DisplayLike>(displays: readonly T[], px: number, py: number): T | null {
  for (const d of displays) {
    const r = regionForDisplay(d)
    if (px >= r.x && py >= r.y && px < r.x + r.width && py < r.y + r.height) return d
  }
  return null
}

export const MIN_VIDEO_BITRATE = 3_000_000
export const MAX_VIDEO_BITRATE = 30_000_000

/** ~0.07 bits per pixel per frame, clamped to 3..30 Mbps. Screen content is mostly static, so
 * hardware H264 stays sharp well below camera-video rates: 1080p30 ≈ 4.4 Mbps, 3440x1440x30 ≈ 10 Mbps. */
export function bitrateFor(width: number, height: number, fps: number): number {
  const raw = Math.round(width * height * fps * 0.07)
  return Math.max(MIN_VIDEO_BITRATE, Math.min(MAX_VIDEO_BITRATE, raw))
}
