/**
 * Zoom sounds: a soft, breathy whoosh under each camera move.
 *
 * Filtered noise swept up in pitch as the camera zooms in, down as it zooms
 * back out, and a quieter breath for a pan between two close zooms. No tone,
 * no hard attack: a gentle swell and fade that sits under a voice. Generated
 * in code from a fixed seed, so every export sounds the same and nothing needs
 * licensing.
 */

import type { ZoomSegment } from './types'
import { cutAt, type Cut } from './cuts'
import { HOLD_GAP_SEC, OUT_LEAD_FRACTION, OUT_SLOWDOWN } from './camera'

export type ZoomMove = 'in' | 'out' | 'pan'
export type ZoomSoundStyle = 'classic' | 'asmr'

export interface ZoomSoundSettings {
  enabled: boolean
  /** Missing in older projects: retain the original whoosh. */
  style?: ZoomSoundStyle
  /** 0..1, before the master volume. */
  volume: number
}

export const DEFAULT_ZOOM_SOUND: ZoomSoundSettings = { enabled: false, volume: 0.25, style: 'asmr' }

export interface ZoomTransition {
  /** Source seconds when the camera starts moving. */
  t: number
  move: ZoomMove
}

/**
 * When the camera starts each move, using the same timing as the camera path:
 * zoom in at a segment's start, pan when the next zoom follows within
 * HOLD_GAP_SEC, otherwise zoom out shortly before the segment ends.
 */
export function zoomTransitions(segments: readonly ZoomSegment[], easeSec: number): ZoomTransition[] {
  const sorted = [...segments].filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end)).sort((a, b) => a.start - b.start)
  const segs = sorted.map((s, i) => ({ start: s.start, end: Math.min(s.end, sorted[i + 1]?.start ?? Infinity) })).filter((s) => s.end > s.start)
  const ease = Math.max(0, easeSec)
  const out: ZoomTransition[] = []
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    const prev = segs[i - 1]
    const next = segs[i + 1]
    const heldFromPrev = prev !== undefined && s.start - prev.end < HOLD_GAP_SEC
    out.push({ t: s.start, move: heldFromPrev ? 'pan' : 'in' })
    const holdsIntoNext = next !== undefined && next.start - s.end < HOLD_GAP_SEC
    if (!holdsIntoNext) out.push({ t: Math.max(s.start + (s.end - s.start) / 2, s.end - ease * OUT_LEAD_FRACTION), move: 'out' })
  }
  return out
}

/** Moves inside [start, end) and outside removed clips. */
export function audibleZoomTransitions(transitions: readonly ZoomTransition[], range: { start: number; end: number }, cuts: readonly Cut[] = []): ZoomTransition[] {
  return transitions.filter((m) => m.t >= range.start && m.t < range.end && !cutAt(m.t, cuts))
}

export const ZOOM_SAMPLE_RATE = 48000
/** Loudest sample before volume: well under the clicks, so moves stay in the background. */
const PEAK = 0.45

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Sound length follows the move's duration, so a slow ease gets a longer breath. */
export function zoomSoundSeconds(move: ZoomMove, easeSec: number): number {
  const base = Math.max(0.15, easeSec)
  const seconds = move === 'out' ? base * OUT_SLOWDOWN * 1.1 : move === 'pan' ? base * 0.9 : base * 1.1
  return Math.round(Math.min(1.6, Math.max(0.35, seconds)) * 20) / 20
}

const cache = new Map<string, Float32Array>()

/** Mono samples of one whoosh. */
export function zoomSound(move: ZoomMove, easeSec: number, sampleRate = ZOOM_SAMPLE_RATE, style: ZoomSoundStyle = 'classic'): Float32Array {
  const seconds = zoomSoundSeconds(move, easeSec) * (style === 'asmr' ? 0.75 : 1)
  const key = `${style}@${move}@${seconds}@${sampleRate}`
  const hit = cache.get(key)
  if (hit) return hit
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  const rand = mulberry32(move === 'in' ? 101 : move === 'out' ? 202 : 303)
  // Frequency sweep, Hz: rising air for in, falling for out, a small lift for pan.
  const [from, to] = style === 'asmr'
    ? (move === 'in' ? [180, 650] : move === 'out' ? [500, 140] : [220, 360])
    : (move === 'in' ? [320, 1900] : move === 'out' ? [1700, 280] : [650, 1000])
  let low = 0
  let band = 0
  let pink = 0
  for (let i = 0; i < n; i++) {
    const u = i / n
    // Ease the sweep so pitch moves fastest mid-whoosh, like air past the ear.
    const sweep = u * u * (3 - 2 * u)
    const freq = from * Math.pow(to / from, sweep)
    // State-variable band-pass, low resonance for a breathy, not whistling, tone.
    const f = 2 * Math.sin((Math.PI * freq) / sampleRate)
    const q = 0.9
    // Soften the white noise toward pink so it is warm rather than hissy.
    pink = pink * 0.72 + (rand() * 2 - 1) * 0.28
    low += f * band
    const high = pink - low - q * band
    band += f * high
    // Swell and fade: slow rise to a peak just before the middle, long gentle tail.
    const peakAt = move === 'out' ? 0.3 : 0.42
    const env = u < peakAt ? Math.pow(Math.sin((u / peakAt) * (Math.PI / 2)), 2) : Math.pow(Math.cos(((u - peakAt) / (1 - peakAt)) * (Math.PI / 2)), 1.6)
    out[i] = (band * 0.8 + low * 0.2) * env
  }
  let peak = 0
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  const targetPeak = style === 'asmr' ? (move === 'out' ? 0.13 : 0.18) : PEAK
  const gain = peak > 0 ? (move === 'pan' ? targetPeak * 0.6 : targetPeak) / peak : 0
  for (let i = 0; i < n; i++) out[i] *= gain
  cache.set(key, out)
  return out
}

export interface SoundRun {
  start: number
  samples: Float32Array
}

/** Mix the whooshes into non-overlapping runs, the same shape the click track uses. */
export function zoomSoundRuns(transitions: readonly ZoomTransition[], easeSec: number, settings: ZoomSoundSettings, sampleRate = ZOOM_SAMPLE_RATE): SoundRun[] {
  const gain = Math.max(0, Math.min(1, Number.isFinite(settings.volume) ? settings.volume : 0))
  if (!settings.enabled || gain === 0 || transitions.length === 0) return []
  const placed = [...transitions].sort((a, b) => a.t - b.t).map((m) => ({ t: m.t, sound: zoomSound(m.move, easeSec, sampleRate, settings.style) }))
  const runs: Array<{ start: number; end: number; items: typeof placed }> = []
  for (const p of placed) {
    const end = p.t + p.sound.length / sampleRate
    const last = runs.at(-1)
    if (last && p.t < last.end) {
      last.items.push(p)
      last.end = Math.max(last.end, end)
    } else runs.push({ start: p.t, end, items: [p] })
  }
  return runs.map((run) => {
    const samples = new Float32Array(Math.ceil((run.end - run.start) * sampleRate))
    for (const p of run.items) {
      const offset = Math.round((p.t - run.start) * sampleRate)
      for (let i = 0; i < p.sound.length && offset + i < samples.length; i++) samples[offset + i] += p.sound[i] * gain
    }
    for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i]))
    return { start: run.start, samples }
  })
}
