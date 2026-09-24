/**
 * Click sounds: short synthesized ticks placed on every mouse press.
 *
 * Sounds are generated in code, not loaded from files, so there is nothing to
 * license or bundle and every export sounds identical. Noise comes from a
 * seeded generator, so a given style always produces the same samples.
 */

import { cutAt, type Cut } from './cuts'
import type { RecordingEvents } from './types'

export type ClickSoundStyle = 'soft' | 'mouse' | 'pop' | 'tick' | 'asmr'

export interface ClickSoundSettings {
  enabled: boolean
  style: ClickSoundStyle
  /** 0..1, before the master volume. */
  volume: number
}

export const DEFAULT_CLICK_SOUND: ClickSoundSettings = { enabled: false, style: 'asmr', volume: 0.3 }

export const CLICK_SOUND_STYLES: ReadonlyArray<{ value: ClickSoundStyle; label: string }> = [
  { value: 'asmr', label: 'Soft / ASMR' },
  { value: 'soft', label: 'Soft' },
  { value: 'mouse', label: 'Mouse' },
  { value: 'pop', label: 'Pop' },
  { value: 'tick', label: 'Tick' }
]

export const CLICK_SAMPLE_RATE = 48000

/** Loudest sample of any style, before volume. Leaves headroom for voice. */
const PEAK = 0.7

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

/** Length of the Tick style, the short two-tone tick first written for window-tracking recordings. */
const TICK_SECONDS = 0.045

function tickSample(t: number): number {
  if (t < 0 || t >= TICK_SECONDS) return 0
  const envelope = Math.min(1, t / 0.001) * Math.exp(-t * 145) * (1 - t / TICK_SECONDS)
  return envelope * (Math.sin(t * Math.PI * 2 * 1800) * 0.22 + Math.sin(t * Math.PI * 2 * 3100) * 0.1)
}

const soundCache = new Map<string, Float32Array>()

/** Mono samples of one click at `sampleRate`, peak-normalised to PEAK. */
export function clickSound(style: ClickSoundStyle, sampleRate = CLICK_SAMPLE_RATE): Float32Array {
  const key = `${style}@${sampleRate}`
  const hit = soundCache.get(key)
  if (hit) return hit
  const rand = mulberry32(style === 'soft' ? 11 : style === 'mouse' ? 23 : 37)
  const seconds = style === 'soft' ? 0.07 : style === 'mouse' ? 0.09 : style === 'tick' ? TICK_SECONDS : 0.08
  const n = Math.round(seconds * sampleRate)
  const out = new Float32Array(n)
  let lp = 0
  let prevNoise = 0
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    const noise = rand() * 2 - 1
    let v = 0
    if (style === 'asmr') {
      // Muted fingertip tap: low-passed texture, rounded attack, no bright transient.
      lp += (noise - lp) * (1 - Math.exp(-2 * Math.PI * 550 / sampleRate))
      const attack = Math.pow(Math.sin(Math.min(1, t / 0.008) * Math.PI / 2), 2)
      v = (lp * 0.25 + Math.sin(2 * Math.PI * 240 * t) * 0.75) * attack * Math.exp(-t / 0.016)
    } else if (style === 'soft') {
      // Trackpad-like tick: a bright, very short noise transient over a small low thump.
      const hp = noise - prevNoise
      v = hp * Math.exp(-t / 0.0035) * 0.55 + Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.012) * 0.5
    } else if (style === 'mouse') {
      // Mouse switch: a sharp ring near 2.4 kHz, then a quieter release click 45 ms later.
      lp += (noise - lp) * 0.35
      const press = Math.exp(-t / 0.006) * (Math.sin(2 * Math.PI * 2400 * t) * 0.6 + lp * 0.8)
      const tr = t - 0.045
      const release = tr > 0 ? Math.exp(-tr / 0.004) * (Math.sin(2 * Math.PI * 3100 * tr) * 0.25 + lp * 0.35) : 0
      v = press + release
    } else if (style === 'tick') {
      v = tickSample(t)
    } else {
      // Pop: a quick downward pitch sweep with a soft attack.
      const freq = 900 * Math.exp(-t / 0.03) + 380
      const phase = 2 * Math.PI * (380 * t + 900 * 0.03 * (1 - Math.exp(-t / 0.03)))
      const attack = Math.min(1, t / 0.002)
      v = Math.sin(phase) * attack * Math.exp(-t / 0.018) * (freq > 0 ? 1 : 0)
    }
    prevNoise = noise
    out[i] = v
  }
  // Fade the last 5 ms so the tail never clicks by itself.
  const fade = Math.min(n, Math.round(0.005 * sampleRate))
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade
  let peak = 0
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  if (peak > 0) for (let i = 0; i < n; i++) out[i] *= (style === 'asmr' ? 0.28 : PEAK) / peak
  soundCache.set(key, out)
  return out
}

/**
 * Press times in source seconds, sorted. Releases are ignored, and so are
 * presses outside the captured area: a click on another window while
 * recording one app must not tick.
 */
export function audibleClicks(events: Pick<RecordingEvents, 'clicks' | 'region'>): number[] {
  const { width, height } = events.region
  return events.clicks
    .filter((c) => c.down && Number.isFinite(c.t) && c.x >= 0 && c.y >= 0 && c.x < width && c.y < height)
    .map((c) => c.t / 1000)
    .sort((a, b) => a - b)
}

/** Audible presses inside [start, end) and outside removed clips. */
export function clickTimes(events: Pick<RecordingEvents, 'clicks' | 'region'>, range: { start: number; end: number }, cuts: readonly Cut[] = []): number[] {
  return audibleClicks(events).filter((t) => t >= range.start && t < range.end && !cutAt(t, cuts))
}

/** One run of overlapping click sounds, mixed into a single buffer. */
export interface ClickRun {
  /** Source seconds of the first sample. */
  start: number
  samples: Float32Array
}

/**
 * Mix the clicks into non-overlapping runs, so an audio track can carry them
 * with strictly increasing timestamps even for fast double-clicks.
 */
export function clickRuns(times: readonly number[], settings: ClickSoundSettings, sampleRate = CLICK_SAMPLE_RATE): ClickRun[] {
  if (!settings.enabled || times.length === 0) return []
  const sound = clickSound(settings.style, sampleRate)
  const gain = Math.max(0, Math.min(1, Number.isFinite(settings.volume) ? settings.volume : 0))
  if (gain === 0) return []
  const length = sound.length / sampleRate
  const runs: Array<{ start: number; end: number; times: number[] }> = []
  for (const t of times) {
    const last = runs.at(-1)
    if (last && t < last.end) {
      last.times.push(t)
      last.end = Math.max(last.end, t + length)
    } else runs.push({ start: t, end: t + length, times: [t] })
  }
  return runs.map((run) => {
    const samples = new Float32Array(Math.ceil((run.end - run.start) * sampleRate))
    for (const t of run.times) {
      const offset = Math.round((t - run.start) * sampleRate)
      for (let i = 0; i < sound.length && offset + i < samples.length; i++) samples[offset + i] += sound[i] * gain
    }
    for (let i = 0; i < samples.length; i++) samples[i] = Math.max(-1, Math.min(1, samples[i]))
    return { start: run.start, samples }
  })
}

/** How far ahead the preview schedules click sounds, so they land on time instead of a frame late. */
export const CLICK_LOOKAHEAD_SEC = 0.1

/**
 * Which clicks the preview still has to sound.
 *
 * Explicit seeks (the video's `seeking` event, including the jump over a
 * removed clip) reset the position, so skipped clicks never burst. A slow
 * frame is not a seek: everything it passed over is still returned. After a
 * jump over a removed clip the boundary is inclusive, so a click exactly at
 * the resume point still sounds. The position only moves forward between
 * seeks, which lets the caller advance ahead of the playhead to schedule.
 */
export function createPlaybackCursor<T>(initial: readonly T[], start: number, timeOf: (item: T) => number) {
  let items = initial
  let previous = start
  let inclusive = false
  return {
    seek(time: number, includeBoundary = false) {
      previous = time
      inclusive = includeBoundary
    },
    /** `latest` replaces the list, so edits during playback take effect immediately. */
    advance(time: number, cuts: readonly Cut[] = [], latest?: readonly T[]): T[] {
      if (latest) items = latest
      if (time < previous || (time === previous && !inclusive)) return []
      const due = items.filter((item) => {
        const t = timeOf(item)
        return (inclusive ? t >= previous : t > previous) && t <= time && !cutAt(t, cuts)
      })
      previous = time
      inclusive = false
      return due
    }
  }
}

export function createClickPlaybackCursor(clicks: readonly number[], start: number) {
  return createPlaybackCursor(clicks, start, (t) => t)
}

/** The next speed-region edge after `time`, where the playback rate changes. */
export function nextRateChange(time: number, regions: ReadonlyArray<{ start: number; end: number }> = []): number {
  let next = Infinity
  for (const r of regions) {
    if (r.start > time) next = Math.min(next, r.start)
    if (r.end > time) next = Math.min(next, r.end)
  }
  return next
}
