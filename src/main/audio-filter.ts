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

/** Undo the renderer's speed-induced pitch change, then time-stretch with FFmpeg. */
export function audioMixFilter(count: number, spans?: AudioSpeedSpan[], durationSec?: number): string {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw new Error('Unsupported audio track count')
  if (durationSec !== undefined && !(Number.isFinite(durationSec) && durationSec > 0 && durationSec <= 86400)) throw new Error('Invalid export duration')
  const pad = Array.from({length:count},(_,i)=>`[0:a:${i}]aresample=48000:async=1:first_pts=0[a${i}];`).join('')
  const tracks = Array.from({length:count},(_,i)=>`[a${i}]`).join('')
  const mix = `${pad}${tracks}amix=inputs=${count}:duration=longest:normalize=0`
  // Without a length the mix ends with its last sample, which is before an
  // outro card ends: the audio stopped seconds short of the video.
  // apad with no length pads forever and relies on the atrim after it to end
  // the stream. Feeding asplit (the pitch-preserving branch below), that end
  // never arrived: ffmpeg spun at full CPU and ignored SIGTERM, so an export
  // of a take with a slowed section never finished. Padding to a known length
  // ends on its own; the atrim still cuts audio that runs longer.
  const fit = durationSec !== undefined ? `,apad=whole_dur=${durationSec},atrim=duration=${durationSec}` : ''
  if (!spans?.length || spans.every(span=>span.rate===1)) return `${mix}${fit},alimiter=limit=0.95[a]`
  if (spans.length > 512) throw new Error('Too many speed boundaries for pitch-preserving export')
  let previous = 0
  for (const span of spans) {
    if (![span.start,span.end,span.rate].every(Number.isFinite) || Math.abs(span.start-previous)>0.001 || span.end<=span.start || span.end>86400) throw new Error('Invalid audio speed timeline')
    tempoFilters(span.rate)
    previous=span.end
  }
  spans = coalesceSpans(spans)
  const branches = spans.map((_,i)=>`[s${i}]`).join('')
  const pieces = spans.map((span,i)=>{
    const length=span.end-span.start
    return `[s${i}]atrim=start=${span.start}:end=${span.end},asetpts=PTS-STARTPTS,asetrate=${48000/span.rate},aresample=48000,${tempoFilters(span.rate)},apad,atrim=duration=${length}[p${i}];`
  }).join('')
  const outputs=spans.map((_,i)=>`[p${i}]`).join('')
  return `${mix},apad=whole_dur=${previous},atrim=duration=${previous},asplit=${spans.length}${branches};${pieces}${outputs}concat=n=${spans.length}:v=0:a=1,alimiter=limit=0.95[a]`
}
