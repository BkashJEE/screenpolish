export interface AudioSpeedSpan { start: number; end: number; rate: number }

export function tempoFilters(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) throw new Error('Invalid audio speed')
  const values: number[] = []
  while (rate < 0.5) { values.push(0.5); rate /= 0.5 }
  while (rate > 2) { values.push(2); rate /= 2 }
  values.push(rate)
  return values.map(value => `atempo=${value}`).join(',')
}

/**
 * Shortest stretch of audio the mix cuts out on its own. An eased speed ramp
 * is split into steps of about 19 ms, shorter than one 1024-sample audio frame
 * (21 ms), and a step that caught no frame came out empty: concat then failed
 * with "Invalid data found when processing input" and the export stopped.
 */
export const MIN_AUDIO_SPAN_SEC = 0.12

/**
 * Merge neighbouring spans until each lasts at least `minSec`, at the rate
 * that keeps the merged stretch the same length in the source (an output-time
 * weighted average). A span that is long enough on its own is never changed;
 * a short remainder at the very end joins the one before it. The video keeps
 * the fine ramp; the audio's pitch correction moves in ~0.1 s steps, too
 * fine to hear.
 */
export function coalesceSpans(spans: readonly AudioSpeedSpan[], minSec = MIN_AUDIO_SPAN_SEC): AudioSpeedSpan[] {
  const out: AudioSpeedSpan[] = []
  let cur: { start: number; end: number; source: number } | null = null
  const flush = () => {
    if (!cur) return
    out.push({ start: cur.start, end: cur.end, rate: cur.source / (cur.end - cur.start) })
    cur = null
  }
  for (const span of spans) {
    const len = span.end - span.start
    if (cur && cur.end - cur.start >= minSec) flush()
    if (!cur) cur = { start: span.start, end: span.end, source: len * span.rate }
    else {
      cur.end = span.end
      cur.source += len * span.rate
    }
  }
  if (cur && out.length > 0 && cur.end - cur.start < minSec) {
    const last = out.pop()!
    const lastLen = last.end - last.start
    const c = cur as { start: number; end: number; source: number }
    out.push({ start: last.start, end: c.end, rate: (lastLen * last.rate + c.source) / (c.end - last.start) })
    cur = null
  }
  flush()
  return out
}

/** Whether any span changes speed, so the audio needs its pitch corrected piece by piece. */
export function hasSpeedChange(spans?: readonly AudioSpeedSpan[]): boolean {
  return !!spans?.some((span) => span.rate !== 1)
}

function validateSpans(spans: readonly AudioSpeedSpan[]): number {
  if (spans.length > 512) throw new Error('Too many speed boundaries for pitch-preserving export')
  let previous = 0
  for (const span of spans) {
    if (![span.start, span.end, span.rate].every(Number.isFinite) || Math.abs(span.start - previous) > 0.001 || span.end <= span.start || span.end > 86400) throw new Error('Invalid audio speed timeline')
    tempoFilters(span.rate)
    previous = span.end
  }
  return previous
}

function checkCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('Unsupported audio track count')
}

function checkDuration(durationSec?: number): void {
  if (durationSec !== undefined && !(Number.isFinite(durationSec) && durationSec > 0 && durationSec <= 86400)) throw new Error('Invalid export duration')
}

/** Every audio track mixed into one, starting at 0 and, given a length, padded and cut to it. */
function mixChain(count: number, durationSec?: number): string {
  const pad = Array.from({ length: count }, (_, i) => `[0:a:${i}]aresample=48000:async=1:first_pts=0[a${i}];`).join('')
  const tracks = Array.from({ length: count }, (_, i) => `[a${i}]`).join('')
  // Bare apad pads forever and relies on the atrim after it to end the
  // stream, which once hung ffmpeg at full CPU; padding to a known length
  // ends on its own, and the atrim still cuts audio that runs longer.
  const fit = durationSec !== undefined ? `,apad=whole_dur=${durationSec},atrim=duration=${durationSec}` : ''
  return `${pad}${tracks}amix=inputs=${count}:duration=longest:normalize=0${fit}`
}

/** The mix for an export without speed changes: one pass, straight to `[a]`. */
export function audioMixFilter(count: number, durationSec?: number): string {
  checkCount(count)
  checkDuration(durationSec)
  return `${mixChain(count, durationSec)},alimiter=limit=0.95[a]`
}

/**
 * First pass of a mix with speed changes: every track mixed into one WAV the
 * length of the video. The second pass reads its pieces from this file.
 */
export function speedMixPassOneArgs(input: string, count: number, durationSec: number, wav: string): string[] {
  checkCount(count)
  checkDuration(durationSec)
  return ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-filter_complex', `${mixChain(count, durationSec)}[a]`, '-map', '[a]', '-c:a', 'pcm_f32le', wav]
}

/**
 * Second pass: each span read from the mixed WAV as its own input, its
 * pitch restored and its length stretched back, then joined.
 *
 * It used to be one filter graph that split the mix with asplit and cut each
 * branch with atrim before concat. On a real take that failed with "Invalid
 * data found when processing input" whenever a speed region was eased: a
 * branch came out empty and concat rejected it, even with two branches and
 * nothing else in between. Reading each piece as a separate input with -ss
 * and -t needs no asplit at all. Spans are merged first so no piece is
 * shorter than MIN_AUDIO_SPAN_SEC.
 */
export function speedMixPassTwoArgs(video: string, wav: string, spans: readonly AudioSpeedSpan[], out: string): string[] {
  validateSpans(spans)
  const pieces = coalesceSpans(spans)
  const inputs = pieces.flatMap((span) => ['-ss', `${span.start}`, '-t', `${span.end - span.start}`, '-i', wav])
  const chains = pieces
    .map((span, i) => {
      const length = span.end - span.start
      return `[${i + 1}:a]asetpts=PTS-STARTPTS,asetrate=${48000 / span.rate},aresample=48000,${tempoFilters(span.rate)},apad=whole_dur=${length},atrim=duration=${length}[p${i}];`
    })
    .join('')
  const labels = pieces.map((_, i) => `[p${i}]`).join('')
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', video,
    ...inputs,
    '-filter_complex', `${chains}${labels}concat=n=${pieces.length}:v=0:a=1,alimiter=limit=0.95[a]`,
    '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', out
  ]
}

/** The length the speed spans cover, after validating them. */
export function spansEnd(spans: readonly AudioSpeedSpan[]): number {
  return validateSpans(spans)
}
