import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { describe, expect, it } from 'vitest'
import { speedSpans } from '@shared/speed'
import { MIN_AUDIO_SPAN_SEC, audioMixFilter, coalesceSpans, hasSpeedChange, spansEnd, speedMixPassOneArgs, speedMixPassTwoArgs, tempoFilters } from './audio-filter'

it('keeps each tempo stage in the supported range', () => {
  expect(tempoFilters(0.25)).toBe('atempo=0.5,atempo=0.5')
  expect(tempoFilters(4)).toBe('atempo=2,atempo=2')
  expect(() => tempoFilters(Infinity)).toThrow()
})

describe('audioMixFilter (no speed changes)', () => {
  it('pads the mix to the full video, so an outro card is not silent-and-shorter', () => {
    expect(audioMixFilter(1, 8.133)).toContain('apad=whole_dur=8.133,atrim=duration=8.133,alimiter')
  })
  it('leaves the length alone when none is given, and rejects nonsense', () => {
    expect(audioMixFilter(1)).not.toContain('atrim')
    for (const d of [0, -1, NaN, Infinity, 90000]) expect(() => audioMixFilter(1, d)).toThrow()
    expect(() => audioMixFilter(0)).toThrow()
  })
})

describe('speed mix arguments', () => {
  const spans = [{ start: 0, end: 3, rate: 2 }, { start: 3, end: 9, rate: 1 }]

  it('only takes the two-pass path when something changes speed', () => {
    expect(hasSpeedChange(spans)).toBe(true)
    expect(hasSpeedChange([{ start: 0, end: 9, rate: 1 }])).toBe(false)
    expect(hasSpeedChange(undefined)).toBe(false)
  })

  it('reads each piece from the mixed WAV as its own input, with no asplit', () => {
    const args = speedMixPassTwoArgs('/v.mp4', '/m.wav', spans, '/o.mp4')
    const fc = args[args.indexOf('-filter_complex') + 1]!
    expect(fc).not.toContain('asplit')
    expect(args.filter((a) => a === '/m.wav')).toHaveLength(2)
    expect(args.slice(args.indexOf('/v.mp4') + 1, args.indexOf('/v.mp4') + 7)).toEqual(['-ss', '0', '-t', '3', '-i', '/m.wav'])
    expect(fc).toContain('asetrate=24000')
    expect(fc).toContain('concat=n=2')
    expect(args).toContain('0:v:0')
  })

  it('mixes every track in pass one, padded to the video', () => {
    const args = speedMixPassOneArgs('/v.mp4', 2, 9, '/m.wav')
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('amix=inputs=2:duration=longest:normalize=0,apad=whole_dur=9,atrim=duration=9[a]')
    expect(args.at(-1)).toBe('/m.wav')
  })

  it('rejects invalid renderer-provided timelines', () => {
    expect(() => speedMixPassTwoArgs('/v', '/m', [{ start: 1, end: 2, rate: 2 }], '/o')).toThrow()
    expect(spansEnd(spans)).toBe(9)
  })
})

describe('coalesceSpans', () => {
  const eased = speedSpans(0, 10.76, [{ id: 'a', start: 3.23, end: 6.46, rate: 2, ease: 0.3 }]).map((sp) => ({ start: sp.outputStart, end: sp.outputEnd, rate: sp.rate }))

  it('merges the tiny steps of an eased ramp into pieces of at least the minimum', () => {
    expect(eased.length).toBe(35)
    const merged = coalesceSpans(eased)
    expect(merged.length).toBeLessThan(10)
    for (const sp of merged) expect(sp.end - sp.start).toBeGreaterThanOrEqual(MIN_AUDIO_SPAN_SEC - 1e-9)
  })

  it('keeps the timeline whole and the source length exact', () => {
    const merged = coalesceSpans(eased)
    expect(merged[0]!.start).toBe(0)
    expect(merged.at(-1)!.end).toBeCloseTo(eased.at(-1)!.end, 9)
    for (let i = 1; i < merged.length; i++) expect(merged[i]!.start).toBeCloseTo(merged[i - 1]!.end, 9)
    const source = (xs: typeof eased) => xs.reduce((a, sp) => a + (sp.end - sp.start) * sp.rate, 0)
    expect(source(merged)).toBeCloseTo(source(eased), 9)
  })

  it('leaves spans that are already long enough exactly as they were', () => {
    const plain = [{ start: 0, end: 3, rate: 1 }, { start: 3, end: 4.5, rate: 2 }, { start: 4.5, end: 9, rate: 1 }]
    expect(coalesceSpans(plain)).toEqual(plain)
  })
})

// The real bundled ffmpeg, on files shaped like the takes that failed: PCM
// tracks that start seconds in and stop early. Each case below once hung or
// failed outright. Skipped where ffmpeg-static has no binary.
const ffmpeg = typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null

function takeLike(dir: string, videoSec: number, a: [number, number], b: [number, number]): string {
  const input = path.join(dir, 'in.mov')
  execFileSync(ffmpeg!, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=64x64:r=30:d=${videoSec}`, '-itsoffset', `${a[0]}`, '-f', 'lavfi', '-i', `sine=f=440:d=${a[1]}:r=48000`, '-itsoffset', `${b[0]}`, '-f', 'lavfi', '-i', `sine=f=660:d=${b[1]}:r=48000`, '-map', '0', '-map', '1', '-map', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'pcm_s16le', '-ac', '2', input])
  return input
}

function speedMix(dir: string, input: string, spans: Array<{ start: number; end: number; rate: number }>): { ok: boolean; seconds: number; stderr: string } {
  const wav = path.join(dir, 'mix.wav')
  const out = path.join(dir, 'out.mp4')
  const opts = { timeout: 20_000, killSignal: 'SIGKILL' as const, encoding: 'utf8' as const }
  const one = spawnSync(ffmpeg!, speedMixPassOneArgs(input, 2, spansEnd(spans), wav), opts)
  if (one.status !== 0) return { ok: false, seconds: 0, stderr: one.stderr || String(one.signal) }
  const two = spawnSync(ffmpeg!, speedMixPassTwoArgs(input, wav, spans, out), opts)
  if (two.status !== 0) return { ok: false, seconds: 0, stderr: two.stderr || String(two.signal) }
  const probe = spawnSync(ffmpeg!, ['-hide_banner', '-i', out, '-map', '0:a', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const time = [...probe.matchAll(/time=00:00:(\d+\.\d+)/g)].at(-1)
  return { ok: true, seconds: Number(time?.[1]), stderr: '' }
}

describe.skipIf(!ffmpeg)('speed mix with real ffmpeg', () => {
  it('finishes a hard slow-down over late-starting audio (this once spun forever)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-mix-'))
    try {
      const input = takeLike(dir, 14.5, [5.757, 3.37], [5.257, 9.03])
      const result = speedMix(dir, input, [{ start: 0, end: 2.5, rate: 1 }, { start: 2.5, end: 4.956, rate: 0.5 }, { start: 4.956, end: 14.494, rate: 1 }])
      expect(result.stderr).toBe('')
      expect(result.seconds).toBeGreaterThan(14.3)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40_000)

  it('finishes an eased 2x clip after an intro card (this once failed with "Invalid data")', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-ramp-'))
    try {
      const input = takeLike(dir, 11.8, [4.53, 2.34], [4.03, 7.53])
      const recording = speedSpans(0, 10.76, [{ id: 'a', start: 3.23, end: 6.46, rate: 2, ease: 0.3 }]).map((sp) => ({ start: 2.5 + sp.outputStart, end: 2.5 + sp.outputEnd, rate: sp.rate }))
      const spans = [{ start: 0, end: 2.5, rate: 1 }, ...recording]
      const result = speedMix(dir, input, spans)
      expect(result.stderr).toBe('')
      expect(result.seconds).toBeGreaterThan(spans.at(-1)!.end - 0.1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40_000)
})
