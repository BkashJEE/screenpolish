// Pointer interpolation, One Euro smoothing and click ripple state. Pure, no DOM.
import type { MouseButton, RecordingEvents } from './types'

export type PointerSample = [tMs: number, x: number, y: number]

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Linear interpolation inside a time-sorted sample list. Before the first
 * sample the first is returned, after the last the last. Binary search.
 */
function sampleAt(samples: ReadonlyArray<PointerSample>, tMs: number): { x: number; y: number } | null {
  const n = samples.length
  if (n === 0) return null
  const first = samples[0]
  if (n === 1 || tMs <= first[0]) return { x: first[1], y: first[2] }
  const last = samples[n - 1]
  if (tMs >= last[0]) return { x: last[1], y: last[2] }
  // Largest lo with samples[lo][0] <= tMs, hi = lo + 1.
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid][0] <= tMs) lo = mid
    else hi = mid
  }
  const a = samples[lo]
  const b = samples[hi]
  const span = b[0] - a[0]
  const f = span > 0 ? (tMs - a[0]) / span : 0
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f }
}

/** Raw pointer position at `tSec`, linearly interpolated between logged samples. */
export function pointerAt(events: RecordingEvents, tSec: number): { x: number; y: number } | null {
  return sampleAt(events.pointer, tSec * 1000)
}

/** Position inside a resampled (smoothed) path at `tSec`. */
export function smoothedPointerAt(
  path: ReadonlyArray<[number, number, number]>,
  tSec: number
): { x: number; y: number } | null {
  return sampleAt(path, tSec * 1000)
}

/** Camera-only low-pass filter: keep cursor feedback crisp without shaking the
 * whole viewport. Symmetric samples avoid lag and give identical seek/export
 * results regardless of playback direction or frame rate. */
export function cameraPointerAt(path: ReadonlyArray<PointerSample>, tSec: number): { x: number; y: number } | null {
  if (!path.length) return null
  let x = 0, y = 0, weight = 0
  for (let i = -12; i <= 12; i++) {
    const w = 0.5 + 0.5 * Math.cos(Math.PI * i / 13)
    const point = sampleAt(path, (tSec + i * 0.02) * 1000)!
    x += point.x * w
    y += point.y * w
    weight += w
  }
  return { x: x / weight, y: y / weight }
}

/** One Euro cutoff (Hz) for a smoothing strength. 0 -> 40 Hz (barely any), 1 -> 1 Hz (heavy). */
function minCutoffFor(strength: number): number {
  const hi = Math.log(40)
  const lo = Math.log(1)
  return Math.exp(hi + (lo - hi) * strength)
}

/** Speed coefficient: how much fast motion raises the cutoff (Hz per px/s). */
const ONE_EURO_BETA = 0.005
/** Cutoff for the derivative estimate (Hz). */
const ONE_EURO_D_CUTOFF = 1

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz)
  return 1 / (1 + tau / dtSec)
}

/**
 * Running the filter twice halves its cutoff, so each pass is widened by this
 * much to land back on the cutoff `minCutoffFor` asked for: 1/sqrt(2^(1/2)-1),
 * the usual correction for applying a first-order filter n=2 times.
 */
const FILTFILT_CUTOFF_GAIN = 1.5538

/**
 * One One Euro pass over `path`, in place. `reverse` walks from the end, which
 * is what makes the pair of passes zero-phase.
 */
function oneEuroPass(path: Array<[number, number, number]>, minCutoff: number, reverse: boolean): void {
  const n = path.length
  if (n < 2) return
  const start = reverse ? n - 1 : 0
  const step = reverse ? -1 : 1
  let xHat = path[start][1]
  let yHat = path[start][2]
  let dxHat = 0
  let dyHat = 0
  for (let k = 1; k < n; k++) {
    const i = start + step * k
    const [t, x, y] = path[i]
    const te = Math.abs(t - path[i - step][0]) / 1000
    if (te <= 0) {
      path[i] = [t, xHat, yHat]
      continue
    }
    const aD = smoothingFactor(ONE_EURO_D_CUTOFF, te)
    const dx = (x - xHat) / te
    const dy = (y - yHat) / te
    dxHat += aD * (dx - dxHat)
    dyHat += aD * (dy - dyHat)
    const ax = smoothingFactor(minCutoff + ONE_EURO_BETA * Math.abs(dxHat), te)
    const ay = smoothingFactor(minCutoff + ONE_EURO_BETA * Math.abs(dyHat), te)
    xHat += ax * (x - xHat)
    yHat += ay * (y - yHat)
    path[i] = [t, xHat, yHat]
  }
}

/**
 * Resample the pointer log at `fps` from t=0 to the last sample, then run a
 * One Euro filter per axis. `strength` 0 returns the resampled path untouched;
 * 1 smooths heavily while the speed coefficient keeps fast moves tracked.
 */
export function smoothPointerPath(
  events: RecordingEvents,
  strength: number,
  fps = 120
): Array<[number, number, number]> {
  const raw = events.pointer
  if (raw.length === 0) return []
  const dt = 1000 / Math.max(1, fps)
  const lastT = raw[raw.length - 1][0]
  const steps = Math.max(0, Math.floor(lastT / dt + 1e-9))

  const path: Array<[number, number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = i * dt
    const p = sampleAt(raw, t) as { x: number; y: number }
    path.push([t, p.x, p.y])
  }
  if (lastT - steps * dt > 1e-6) {
    const p = sampleAt(raw, lastT) as { x: number; y: number }
    path.push([lastT, p.x, p.y])
  }

  const s = clamp(Number.isFinite(strength) ? strength : 0, 0, 1)
  if (s <= 0 || path.length < 2) return path

  // One Euro is built for live input, where only the past is known, so it can
  // only ever lag. Here the whole log is already on disk, so the same filter is
  // run forwards and then backwards: the delay of the second pass cancels the
  // delay of the first. Smoothing one way alone left the drawn pointer trailing
  // the real one, and because the filter eases harder at low speed the size of
  // that lag changed with the mouse — so click ripples landed early or late by
  // an amount that moved around.
  const minCutoff = minCutoffFor(s) * FILTFILT_CUTOFF_GAIN
  oneEuroPass(path, minCutoff, false)
  oneEuroPass(path, minCutoff, true)
  return path
}

// ---------------------------------------------------------------------------
// Glide

/**
 * Peak pointer speed at full glide and at the gentlest setting, in region
 * diagonals per second. A flick of the mouse measured 11,577 px/s on a
 * 1656x1288 take (about 5.5 diagonals a second); smoothing alone left 6,700.
 */
export const GLIDE_MAX_SPEED_AT_FULL = 0.9
export const GLIDE_MAX_SPEED_AT_LIGHT = 3
/** Below this, in diagonals per second, the pointer counts as resting. */
const REST_SPEED = 0.06
/** The drawn pointer settles this long before a click lands. */
const ARRIVE_BEFORE_CLICK_MS = 60
/** Minimum-jerk travel peaks at this multiple of its average speed. */
const MIN_JERK_PEAK = 1.875

const minJerk = (u: number): number => {
  const x = clamp(u, 0, 1)
  return x * x * x * (10 + x * (-15 + 6 * x))
}

interface Move {
  /** Indices into the path: the last resting sample before, the first after. */
  from: number
  to: number
}

/** Runs of motion between rests, as index ranges of a uniformly sampled path. */
function movesIn(path: ReadonlyArray<[number, number, number]>, restPxPerMs: number): Move[] {
  const moves: Move[] = []
  let start = -1
  for (let i = 1; i < path.length; i++) {
    const dt = path[i]![0] - path[i - 1]![0]
    const v = dt > 0 ? Math.hypot(path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2]) / dt : 0
    if (v > restPxPerMs) {
      if (start < 0) start = i - 1
    } else if (start >= 0) {
      moves.push({ from: start, to: i - 1 })
      start = -1
    }
  }
  if (start >= 0) moves.push({ from: start, to: path.length - 1 })
  return moves
}

/**
 * Slow the drawn pointer's fast moves down without changing where it goes or
 * when it gets there.
 *
 * Smoothing removes jitter but leaves a flick of the mouse as fast as it was,
 * and a zoom doubles how fast it looks. Here each move that is faster than the
 * glide allows is given more time: it starts earlier, in the rest before it,
 * and may finish later, in the rest after it, but never after the next click,
 * and never before the last one. Within that time it follows the same route
 * on a minimum-jerk curve, so it eases out and in. The whole log is known, so
 * the pointer can set off before the hand did and still arrive at every click
 * exactly where and when it happened.
 *
 * `glide` 0 returns the path unchanged; 1 is the slowest.
 */
export function glidePointerPath(
  path: Array<[number, number, number]>,
  clicks: RecordingEvents['clicks'],
  region: { width: number; height: number },
  glide: number
): Array<[number, number, number]> {
  const g = clamp(Number.isFinite(glide) ? glide : 0, 0, 1)
  if (g <= 0 || path.length < 3) return path
  const diagonal = Math.hypot(region.width, region.height)
  if (!(diagonal > 0)) return path
  const maxPxPerMs = (diagonal * (GLIDE_MAX_SPEED_AT_LIGHT + (GLIDE_MAX_SPEED_AT_FULL - GLIDE_MAX_SPEED_AT_LIGHT) * g)) / 1000
  const moves = movesIn(path, (diagonal * REST_SPEED) / 1000)
  const downs = clicks.filter((c) => c.down).map((c) => c.t).sort((a, b) => a - b)
  const out = path.map((p) => [...p] as [number, number, number])
  const at = (t: number) => {
    // Index of the last sample at or before t (uniform sampling, so a search is cheap).
    let lo = 0
    let hi = path.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (path[mid]![0] <= t) lo = mid
      else hi = mid
    }
    return lo
  }

  // Where the previous move, as retimed, really ended: the next one may not
  // start before it, or the two would overlap and the pointer would jump.
  let lastEnd = -Infinity
  moves.forEach((move, k) => {
    const a = path[move.from]!
    const b = path[move.to]!
    // A click in the middle of a move (a drag, a click while moving) pins the
    // pointer to the hand at that moment; retiming would move it off.
    if (downs.some((t) => t > a[0] && t < b[0])) {
      lastEnd = Math.max(lastEnd, b[0])
      return
    }
    // The route, by arc length, so it can be retimed without changing shape.
    const lengths = [0]
    for (let i = move.from + 1; i <= move.to; i++) lengths.push(lengths.at(-1)! + Math.hypot(path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2]))
    const total = lengths.at(-1)!
    if (total <= 0) {
      lastEnd = Math.max(lastEnd, b[0])
      return
    }
    const needMs = (MIN_JERK_PEAK * total) / maxPxPerMs
    const haveMs = b[0] - a[0]
    let peak = 0
    for (let i = move.from + 1; i <= move.to; i++) {
      const dt = path[i]![0] - path[i - 1]![0]
      if (dt > 0) peak = Math.max(peak, (lengths[i - move.from]! - lengths[i - move.from - 1]!) / dt)
    }
    if (peak <= maxPxPerMs) {
      lastEnd = Math.max(lastEnd, b[0])
      return
    }

    // Room in the rests either side, bounded by the neighbouring moves and clicks.
    const prevEnd = k > 0 ? path[moves[k - 1]!.to]![0] : path[0]![0]
    const nextStart = k < moves.length - 1 ? path[moves[k + 1]!.from]![0] : path.at(-1)![0]
    const lastClick = downs.filter((t) => t <= a[0]).at(-1)
    const nextClick = downs.find((t) => t > a[0])
    const earliest = Math.max(prevEnd, lastEnd, lastClick ?? -Infinity)
    const latest = Math.min(nextStart, nextClick !== undefined ? nextClick - ARRIVE_BEFORE_CLICK_MS : Infinity)
    const extra = Math.max(0, needMs - haveMs)
    // Set off earlier first; take any rest of the time after.
    const start = Math.max(earliest, a[0] - extra)
    const end = Math.min(Math.max(latest, b[0]), b[0] + Math.max(0, extra - (a[0] - start)))
    lastEnd = Math.max(lastEnd, end, b[0])
    if (end - start <= haveMs) return

    const from = at(start)
    const to = Math.min(path.length - 1, at(end) + 1)
    for (let i = from; i <= to; i++) {
      const t = path[i]![0]
      if (t < start || t > end) continue
      const s = minJerk((t - start) / (end - start)) * total
      // Position at arc length s along the original route.
      let j = 1
      while (j < lengths.length - 1 && lengths[j]! < s) j++
      const l0 = lengths[j - 1]!
      const l1 = lengths[j]!
      const f = l1 > l0 ? (s - l0) / (l1 - l0) : 0
      const p0 = path[move.from + j - 1]!
      const p1 = path[move.from + j]!
      out[i] = [t, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f]
    }
  })
  return out
}

/** The drawn pointer's path for a project: smoothed, then glided. */
export function pointerPathFor(events: RecordingEvents, cursor: { smoothing: number; glide?: number }): Array<[number, number, number]> {
  return glidePointerPath(smoothPointerPath(events, cursor.smoothing), events.clicks, events.region, cursor.glide ?? 0)
}

export interface Ripple {
  x: number
  y: number
  /** Seconds since the mousedown. */
  age: number
  button: MouseButton
}

/** Click ripples alive at `tSec`: mousedown events with 0 <= age < lifeSec. */
export function ripplesAt(events: RecordingEvents, tSec: number, lifeSec = 0.5): Ripple[] {
  const out: Ripple[] = []
  for (const c of events.clicks) {
    if (!c.down) continue
    const age = tSec - c.t / 1000
    if (age >= 0 && age < lifeSec) out.push({ x: c.x, y: c.y, age, button: c.button })
  }
  return out
}
