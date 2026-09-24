import { cutAt, normalizeCuts, type Cut } from './cuts'

/** Source-time regions. First region wins when hand-edited regions overlap. */
export interface SpeedRegion { id: string; start: number; end: number; rate: number }
export interface SpeedSpan { start: number; end: number; rate: number; outputStart: number; outputEnd: number }

export function speedAt(time: number, regions: readonly SpeedRegion[] = []): number {
  const region = regions.find((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && time >= r.start && time < r.end)
  return region && Number.isFinite(region.rate) ? Math.min(4, Math.max(0.25, region.rate)) : 1
}

/**
 * The output timeline: source spans in order, each with one playback rate.
 * Removed clips (`cuts`) produce no span, so export video and audio both skip
 * them and the following span starts where the previous output ended.
 */
export function speedSpans(start: number, end: number, regions: readonly SpeedRegion[] = [], cuts: readonly Cut[] = []): SpeedSpan[] {
  const removed = normalizeCuts(cuts)
  const edges = [...regions.flatMap((r) => [r.start, r.end]), ...removed.flatMap((c) => [c.start, c.end])]
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
