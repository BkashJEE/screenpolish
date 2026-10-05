import { cutAt, normalizeCuts, type Cut } from './cuts'

/** Source-time regions. First region wins when hand-edited regions overlap. */
export interface SpeedRegion {
  id: string
  start: number
  end: number
  rate: number
  /**
   * Seconds spent easing in and out of `rate` at each edge. Absent or 0 keeps
   * the hard step older projects were saved with, so nothing moves under them.
   */
  ease?: number
}
export interface SpeedSpan { start: number; end: number; rate: number; outputStart: number; outputEnd: number }

/** The rate a region asks for, within the range the editor offers. */
export function regionRate(region: SpeedRegion): number {
  return Number.isFinite(region.rate) ? Math.min(4, Math.max(0.25, region.rate)) : 1
}

/**
 * How long each edge of `region` spends easing. A ramp cannot be longer than
 * half the region, or the two ends would overlap and the rate asked for would
 * never actually be reached.
 */
export function regionEase(region: SpeedRegion): number {
  const ease = Number.isFinite(region.ease) ? (region.ease as number) : 0
  if (!(ease > 0)) return 0
  const half = (region.end - region.start) / 2
  return Math.min(ease, half > 0 ? half : 0)
}

/** Smoothstep: starts and ends at rest, which is what keeps a ramp from reading as a jolt. */
function ramp(from: number, to: number, progress: number): number {
  const t = progress < 0 ? 0 : progress > 1 ? 1 : progress
  return from + (to - from) * t * t * (3 - 2 * t)
}

export function speedAt(time: number, regions: readonly SpeedRegion[] = []): number {
  const region = regions.find((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && time >= r.start && time < r.end)
  if (!region) return 1
  const rate = regionRate(region)
  const ease = regionEase(region)
  if (ease <= 0) return rate
  if (time < region.start + ease) return ramp(1, rate, (time - region.start) / ease)
  if (time > region.end - ease) return ramp(rate, 1, (time - (region.end - ease)) / ease)
  return rate
}

/**
 * Steps a ramp is cut into. Each step becomes a constant-rate span, so the
 * export's video timing, its audio tempo chain and pitch preservation all keep
 * working untouched. Sixteen is fine enough that the change is not heard, and
 * small enough that several eased regions stay well inside the 512-span
 * ceiling the pitch-preserving filter imposes.
 */
export const RAMP_STEPS = 16

/** Where the rate changes inside a region: its edges, plus the ramp subdivisions. */
function rateEdges(region: SpeedRegion): number[] {
  const ease = regionEase(region)
  if (ease <= 0) return [region.start, region.end]
  const out: number[] = []
  for (let i = 0; i <= RAMP_STEPS; i++) {
    out.push(region.start + (ease * i) / RAMP_STEPS)
    out.push(region.end - ease + (ease * i) / RAMP_STEPS)
  }
  return out
}

/**
 * The output timeline: source spans in order, each with one playback rate.
 * Removed clips (`cuts`) produce no span, so export video and audio both skip
 * them and the following span starts where the previous output ended.
 */
export function speedSpans(start: number, end: number, regions: readonly SpeedRegion[] = [], cuts: readonly Cut[] = []): SpeedSpan[] {
  const removed = normalizeCuts(cuts)
  const edges = [...regions.flatMap(rateEdges), ...removed.flatMap((c) => [c.start, c.end])]
  const bounds = [...new Set([start, end, ...edges.filter((t) => Number.isFinite(t) && t > start && t < end)])].sort((a, b) => a - b)
  let outputStart = 0
  const spans: SpeedSpan[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const s = bounds[i]
    const e = bounds[i + 1]
    const mid = (s + e) / 2
    if (cutAt(mid, removed)) continue
    const rate = speedAt(mid, regions)
    const outputEnd = outputStart + (e - s) / rate
    spans.push({ start: s, end: e, rate, outputStart, outputEnd })
    outputStart = outputEnd
  }
  return spans
}

export function sourceTimeAt(outputTime: number, spans: readonly SpeedSpan[]): number {
  const span = spans.find((s) => outputTime < s.outputEnd) ?? spans.at(-1)
  return span ? Math.min(span.end, span.start + Math.max(0, outputTime - span.outputStart) * span.rate) : 0
}
