/**
 * Keyboard stepping and the recent-colour list for the colour picker.
 * Pure, so the picker's behaviour is testable without a DOM.
 */
import type { Hsv } from '../../shared/color'
import { normalizeHex } from '../../shared/color'

/** Saturation and brightness move in 1% steps, 10% with Shift. Hue moves in degrees. */
export const SV_STEP = 0.01
export const SV_STEP_COARSE = 0.1
export const HUE_STEP = 1
export const HUE_STEP_COARSE = 10

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * The colour a key press moves to, or null when the key is not ours — so the
 * caller only swallows the events it actually handled.
 */
export function stepSv(hsv: Hsv, key: string, coarse = false): Hsv | null {
  const d = coarse ? SV_STEP_COARSE : SV_STEP
  switch (key) {
    case 'ArrowLeft':
      return { ...hsv, s: clamp01(hsv.s - d) }
    case 'ArrowRight':
      return { ...hsv, s: clamp01(hsv.s + d) }
    case 'ArrowUp':
      return { ...hsv, v: clamp01(hsv.v + d) }
    case 'ArrowDown':
      return { ...hsv, v: clamp01(hsv.v - d) }
    case 'Home':
      return { ...hsv, s: 0, v: 1 }
    case 'End':
      return { ...hsv, s: 1, v: 1 }
    default:
      return null
  }
}

/** Hue wraps: stepping past red comes back round rather than sticking at an end. */
export function stepHue(hue: number, key: string, coarse = false): number | null {
  const d = coarse ? HUE_STEP_COARSE : HUE_STEP
  const wrap = (h: number): number => ((h % 360) + 360) % 360
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowDown':
      return wrap(hue - d)
    case 'ArrowRight':
    case 'ArrowUp':
      return wrap(hue + d)
    case 'Home':
      return 0
    case 'End':
      return 180
    default:
      return null
  }
}

export const RECENT_COLOURS_MAX = 8

/**
 * Most recent first, no duplicates, capped. Anything that is not a colour is
 * ignored, so a damaged stored list cannot break the picker.
 */
export function rememberColour(recent: readonly string[], hex: string, max = RECENT_COLOURS_MAX): string[] {
  const norm = normalizeHex(hex)
  if (!norm) return recent.filter((c): c is string => normalizeHex(c) !== null).slice(0, max)
  const rest = recent.map((c) => normalizeHex(c)).filter((c): c is string => c !== null && c !== norm)
  return [norm, ...rest].slice(0, max)
}
