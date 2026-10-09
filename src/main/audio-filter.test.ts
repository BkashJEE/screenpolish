import { describe, expect, it } from 'vitest'
import { audioMixFilter, tempoFilters } from './audio-filter'
it('keeps each tempo stage in the supported range',()=>{
  expect(tempoFilters(0.25)).toBe('atempo=0.5,atempo=0.5')
  expect(tempoFilters(4)).toBe('atempo=2,atempo=2')
})
it('restores pitch and preserves each output span duration',()=>{
  const filter=audioMixFilter(2,[{start:0,end:3,rate:2},{start:3,end:9,rate:1}])
  expect(filter).toContain('asetrate=24000')
  expect(filter).toContain('atrim=duration=3')
  expect(filter).toContain('concat=n=2')
})
it('rejects invalid renderer-provided timelines',()=>{
  expect(()=>audioMixFilter(1,[{start:1,end:2,rate:2}])).toThrow()
  expect(()=>tempoFilters(Infinity)).toThrow()
})

describe('audio length', () => {
  it('pads the mix to the full video, so an outro card is not silent-and-shorter', () => {
    expect(audioMixFilter(1, undefined, 8.133)).toContain('apad=whole_dur=8.133,atrim=duration=8.133,alimiter')
    expect(audioMixFilter(1, [{ start: 0, end: 8, rate: 1 }], 8)).toContain('atrim=duration=8')
  })
  it('leaves the length alone when none is given', () => {
    expect(audioMixFilter(1)).not.toContain('atrim')
  })
  it('rejects a nonsense length', () => {
    for (const d of [0, -1, NaN, Infinity, 90000]) expect(() => audioMixFilter(1, undefined, d)).toThrow()
  })
})

// Runs the real bundled ffmpeg: a filter that is only checked as a string
// once looped forever on a real take. Skipped where ffmpeg-static has no binary.
import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'

const ffmpeg = typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null

describe.skipIf(!ffmpeg)('audioMixFilter with real ffmpeg', () => {
  it('finishes, and fills the video, for a slowed section over late-starting audio shorter than the video', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-mix-'))
    try {
      // Shaped like the take that hung: 14.5 s of video and two PCM tracks
      // that start late (5.26 s and 5.76 s) and stop early, so the mix has to
      // fill silence at both ends. AAC tracks starting at 0 did not hang.
      const input = path.join(dir, 'in.mov')
      execFileSync(ffmpeg!, ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30:d=14.5', '-itsoffset', '5.757', '-f', 'lavfi', '-i', 'sine=f=440:d=3.37:r=48000', '-itsoffset', '5.257', '-f', 'lavfi', '-i', 'sine=f=660:d=9.03:r=48000', '-map', '0', '-map', '1', '-map', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'pcm_s16le', '-ac', '2', input])
      const spans = [{ start: 0, end: 2.5, rate: 1 }, { start: 2.5, end: 4.956, rate: 0.5 }, { start: 4.956, end: 14.494, rate: 1 }]
      const out = path.join(dir, 'out.mp4')
      const run = spawnSync(ffmpeg!, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-filter_complex', audioMixFilter(2, spans, 14.494), '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', out], { timeout: 20_000, killSignal: 'SIGKILL' })
      expect(run.signal).toBeNull()
      expect(run.status).toBe(0)
      const probe = spawnSync(ffmpeg!, ['-hide_banner', '-i', out], { encoding: 'utf8' }).stderr
      const duration = /Duration: 00:00:(\d+\.\d+)/.exec(probe)
      expect(Number(duration?.[1])).toBeGreaterThan(14.3)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 40_000)
})
