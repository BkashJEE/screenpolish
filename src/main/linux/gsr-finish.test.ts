import { describe, expect, it } from 'vitest'
import { ALIGN_THRESHOLD_MS, alignArgs, remuxArgs, rescaleEvents } from './gsr-finish'
import type { RecordingEvents } from '@shared/types'

describe('remuxArgs', () => {
  it('copies streams into a fast-start MP4 without re-encoding', () => {
    const a = remuxArgs('/r/screen.mkv', '/r/screen.mp4')
    expect(a).toEqual(expect.arrayContaining(['-i', '/r/screen.mkv', '-c', 'copy', '-movflags', '+faststart', '/r/screen.mp4']))
  })
})

describe('alignArgs', () => {
  it('leaves a track alone when it is already in step', () => {
    expect(alignArgs('audio', ALIGN_THRESHOLD_MS - 1, 'in', 'out')).toBeNull()
    expect(alignArgs('audio', NaN, 'in', 'out')).toBeNull()
  })

  it('pads the microphone with silence when it started after the screen', () => {
    const a = alignArgs('audio', 240, 'mic.mp4', 'out.mp4')!
    expect(a[a.indexOf('-af') + 1]).toBe('adelay=240:all=1')
  })

  it('holds the webcam first frame for the gap instead of black', () => {
    const a = alignArgs('video', 240, 'webcam.mp4', 'out.mp4')!
    expect(a[a.indexOf('-vf') + 1]).toBe('tpad=start_duration=0.240:start_mode=clone')
  })

  it('drops the head of a track that started before the screen', () => {
    const a = alignArgs('audio', -120, 'mic.mp4', 'out.mp4')!
    expect(a[a.indexOf('-ss') + 1]).toBe('0.120')
    expect(a.indexOf('-ss')).toBeLessThan(a.indexOf('-i'))
  })
})

describe('rescaleEvents', () => {
  const events: RecordingEvents = {
    version: 1,
    startedAt: 0,
    region: { x: 0, y: 0, width: 250, height: 125, scale: 1.25 },
    pointer: [[0, 125, 62.5]],
    clicks: [{ t: 10, x: 250, y: 125, button: 'left', down: true }],
    wheel: [{ t: 20, x: 50, y: 25, dy: 1 }],
    keys: []
  }

  it('moves every position onto the real video size gsr produced', () => {
    const r = rescaleEvents(events, { width: 252, height: 126 })
    expect(r.region).toMatchObject({ width: 252, height: 126 })
    expect(r.pointer[0][1]).toBeCloseTo(126, 9)
    expect(r.pointer[0][2]).toBeCloseTo(63, 9)
    expect(r.clicks[0]).toMatchObject({ x: 252, y: 126 })
    expect(r.wheel[0].x).toBeCloseTo(50.4, 9)
    expect(r.region.scale).toBeCloseTo(1.25 * 252 / 250, 9)
  })

  it('returns the same log when the size already matches', () => {
    expect(rescaleEvents(events, { width: 250, height: 125 })).toBe(events)
  })
})

// Runs the real bundled ffmpeg, so the alignment is checked on actual audio,
// not just on the arguments. Skipped where ffmpeg-static has no binary.
import { execFileSync, spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import ffmpegStatic from 'ffmpeg-static'
import { alignFile } from './gsr-finish'

const ffmpeg = typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null

/** ffmpeg's silencedetect report for a file. It prints to stderr, read directly so no shell is needed. */
function silenceLog(file: string): string {
  return spawnSync(ffmpeg!, ['-hide_banner', '-i', file, '-af', 'silencedetect=n=-50dB:d=0.1', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
}

describe.skipIf(!ffmpeg)('alignFile with real ffmpeg', () => {
  it('pads a microphone track with the offset in silence, so its first sound lands that much later', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-align-'))
    try {
      const mic = path.join(dir, 'mic.mp4')
      execFileSync(ffmpeg!, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'aac', mic])
      expect(await alignFile(ffmpeg!, mic, 'audio', 250)).toBe(true)
      const end = /silence_end: ([\d.]+)/.exec(silenceLog(mic))
      expect(end).not.toBeNull()
      expect(Number(end![1])).toBeGreaterThan(0.2)
      expect(Number(end![1])).toBeLessThan(0.32)
      expect(fs.readdirSync(dir)).toEqual(['mic.mp4'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves a track alone when it is already in step', async () => {
    expect(await alignFile(ffmpeg ?? 'ffmpeg', '/nonexistent/mic.mp4', 'audio', 5)).toBe(false)
  })
})
