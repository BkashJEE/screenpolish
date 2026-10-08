export interface AudioSpeedSpan { start: number; end: number; rate: number }

export function tempoFilters(rate: number): string {
  if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) throw new Error('Invalid audio speed')
  const values: number[] = []
  while (rate < 0.5) { values.push(0.5); rate /= 0.5 }
  while (rate > 2) { values.push(2); rate /= 2 }
  values.push(rate)
  return values.map(value => `atempo=${value}`).join(',')
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
  const fit = durationSec !== undefined ? `,apad,atrim=duration=${durationSec}` : ''
  if (!spans?.length || spans.every(span=>span.rate===1)) return `${mix}${fit},alimiter=limit=0.95[a]`
  if (spans.length > 512) throw new Error('Too many speed boundaries for pitch-preserving export')
  let previous = 0
  for (const span of spans) {
    if (![span.start,span.end,span.rate].every(Number.isFinite) || Math.abs(span.start-previous)>0.001 || span.end<=span.start || span.end>86400) throw new Error('Invalid audio speed timeline')
    tempoFilters(span.rate)
    previous=span.end
  }
  const branches = spans.map((_,i)=>`[s${i}]`).join('')
  const pieces = spans.map((span,i)=>{
    const length=span.end-span.start
    return `[s${i}]atrim=start=${span.start}:end=${span.end},asetpts=PTS-STARTPTS,asetrate=${48000/span.rate},aresample=48000,${tempoFilters(span.rate)},apad,atrim=duration=${length}[p${i}];`
  }).join('')
  const outputs=spans.map((_,i)=>`[p${i}]`).join('')
  return `${mix},apad,atrim=duration=${previous},asplit=${spans.length}${branches};${pieces}${outputs}concat=n=${spans.length}:v=0:a=1,alimiter=limit=0.95[a]`
}
