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

  const minCutoff = minCutoffFor(s)
  let xHat = path[0][1]
  let yHat = path[0][2]
  let dxHat = 0
  let dyHat = 0
  for (let i = 1; i < path.length; i++) {
    const [t, x, y] = path[i]
    const te = (t - path[i - 1][0]) / 1000
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
  return path
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
