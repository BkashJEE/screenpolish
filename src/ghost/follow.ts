/**
 * Where the ghost pointer should be, given a polled position.
 *
 * On Windows and macOS the real cursor is hidden for the length of a take, so
 * it stays out of the recording, and this window draws a stand-in that only the
 * user sees. Its position arrives two ways:
 *
 *   - forwarded mouse moves: instant, at the native pointer rate
 *   - a poll from the main process: the fallback when forwarding stops, which
 *     it does whenever the pointer is over another always-on-top window
 *
 * The handover between them is what made the ghost fall out of step with the
 * hand moving it. The poll was ignored until 250 ms had passed with no
 * forwarded move, so the ghost froze for a quarter of a second, then jumped.
 * Forwarding stops over the app's own recording HUD, so this happened exactly
 * when reaching for the stop button - and a click there landed while the ghost
 * was still somewhere else.
 */

/**
 * How long a forwarded move counts as current. A little over one fallback poll,
 * so the poll takes over almost as soon as forwarding goes quiet, but never
 * fights a live stream of forwarded moves.
 */
export const LOCAL_FRESH_MS = 60

export type Placement =
  | { action: 'ignore' }
  | { action: 'place'; x: number; y: number }
  | { action: 'hide' }

/**
 * Decide what to do with one polled pointer position.
 *
 * `point` is in screen coordinates; `origin` is this window's display origin and
 * `size` its size, so the point is converted to this window's own space.
 */
export function placeFromPoll(
  now: number,
  lastLocal: number,
  point: { x: number; y: number },
  origin: { x: number; y: number },
  size: { width: number; height: number }
): Placement {
  const x = point.x - origin.x
  const y = point.y - origin.y
  // There is one ghost window per display. When the pointer is on another one,
  // this window's sprite has to go at once - not after the freshness window -
  // or the display you just left keeps a stale ghost stuck at its edge, and two
  // pointers are on screen together.
  if (x < 0 || y < 0 || x >= size.width || y >= size.height) return { action: 'hide' }
  if (now - lastLocal < LOCAL_FRESH_MS) return { action: 'ignore' }
  return { action: 'place', x, y }
}
