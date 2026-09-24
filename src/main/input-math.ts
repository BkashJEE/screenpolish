// Pure input-log math shared by the uiohook logger and its tests.

import type { CaptureRegion, MouseButton } from '@shared/types'

export type PointerSample = [t: number, x: number, y: number]

/** Minimum spacing between kept pointer samples: 8 ms ≈ 120 Hz. */
export const POINTER_MIN_GAP_MS = 8

/**
 * Thin a pointer path to at most one sample per `minGapMs`. The first sample
 * is always kept; a sample is kept when it is at least `minGapMs` after the
 * previously kept one. Order is preserved, input is not mutated.
 */
export function thinPointer(samples: readonly PointerSample[], minGapMs = POINTER_MIN_GAP_MS): PointerSample[] {
  const out: PointerSample[] = []
  let lastKept = Number.NEGATIVE_INFINITY
  for (const s of samples) {
    if (s[0] - lastKept >= minGapMs) {
      out.push(s)
      lastKept = s[0]
    }
  }
  return out
}

/** Streaming form of the same rule, so the live logger and thinPointer agree. */
export function createPointerThinner(minGapMs = POINTER_MIN_GAP_MS): (t: number) => boolean {
  let lastKept = Number.NEGATIVE_INFINITY
  return (t) => {
    if (t - lastKept < minGapMs) return false
    lastKept = t
    return true
  }
}

/** Screen physical px -> region-relative physical px. Not clamped; the pointer may leave the region. */
export function toRegionRelative(x: number, y: number, region: Pick<CaptureRegion, 'x' | 'y'>): [number, number] {
  return [x - region.x, y - region.y]
}

/** uiohook button numbers on Windows: 1 = left, 2 = right, 3 = middle. Others are ignored. */
export function mapButton(button: unknown): MouseButton | null {
  switch (button) {
    case 1:
      return 'left'
    case 2:
      return 'right'
    case 3:
      return 'middle'
    default:
      return null
  }
}

/** Wheel rotation sign -> dy (positive = scroll down). Magnitude is kept for high-resolution wheels. */
export function wheelDy(rotation: number): number {
  if (!Number.isFinite(rotation) || rotation === 0) return 0
  return rotation
}
