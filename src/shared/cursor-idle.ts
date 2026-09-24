/**
 * Fading the drawn pointer while it sits still.
 *
 * A pointer parked in the middle of a still frame draws the eye to nothing.
 * After `afterSec` without movement or a click it fades out, and any activity
 * brings it straight back. Off unless the project asks for it, so recordings
 * made before this existed look exactly as they did.
 */
import type { RecordingEvents } from './types'
import type { PointerSample } from './pointer'

/** How long the fade itself takes, once the idle delay has passed. */
export const IDLE_FADE_SEC = 0.35

/** Movement below this many source pixels between samples is jitter, not activity. */
export const IDLE_MOVE_EPSILON_PX = 1.5

/**
 * Seconds since the pointer last moved or was clicked, at `tSec`.
 *
 * Scanning stops once it is further back than `maxLookbackSec`, because
 * anything older already means "fully idle" and a long still stretch should
 * not cost a walk over the whole take every frame.
 */
export function idleSecondsAt(
  path: ReadonlyArray<PointerSample>,
  clicks: RecordingEvents['clicks'],
  tSec: number,
  maxLookbackSec = 30
): number {
  let lastActivity = -Infinity

  for (let i = clicks.length - 1; i >= 0; i--) {
    const t = clicks[i].t / 1000
    if (t <= tSec) {
      lastActivity = t
      break
    }
  }

  // Samples are in time order: find the newest one at or before tSec, then walk
  // back while the pointer has not really moved.
  let i = path.length - 1
  while (i >= 0 && path[i][0] / 1000 > tSec) i--
  for (; i > 0; i--) {
    const t = path[i][0] / 1000
    if (tSec - t > maxLookbackSec) break
    const [, x, y] = path[i]
    const [, px, py] = path[i - 1]
    if (Math.abs(x - px) > IDLE_MOVE_EPSILON_PX || Math.abs(y - py) > IDLE_MOVE_EPSILON_PX) {
      lastActivity = Math.max(lastActivity, t)
      break
    }
  }

  if (lastActivity === -Infinity) return tSec
  return Math.max(0, tSec - lastActivity)
}

/**
 * Opacity for the drawn pointer: 1 until the delay passes, then down to 0
 * across the fade. `afterSec` of 0 or less means the feature is off.
 */
export function idleCursorAlpha(idleSec: number, afterSec: number, fadeSec = IDLE_FADE_SEC): number {
  if (!(afterSec > 0)) return 1
  if (idleSec <= afterSec) return 1
  if (fadeSec <= 0) return 0
  const t = (idleSec - afterSec) / fadeSec
  return t >= 1 ? 0 : 1 - t
}

/** Convenience for the renderer: the alpha to draw the pointer with at `tSec`. */
export function cursorAlphaAt(
  path: ReadonlyArray<PointerSample>,
  clicks: RecordingEvents['clicks'],
  tSec: number,
  afterSec: number | undefined
): number {
  if (!(afterSec && afterSec > 0)) return 1
  return idleCursorAlpha(idleSecondsAt(path, clicks, tSec), afterSec)
}
