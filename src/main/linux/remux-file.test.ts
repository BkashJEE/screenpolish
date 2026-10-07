import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REMUX_MIN_BYTES_PER_SEC, remuxFile, remuxTimeoutMs } from './gsr-finish'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-remux-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('remuxFile', () => {
  it('gives the output its real name only once ffmpeg has finished', async () => {
    const input = path.join(dir, 'screen.mkv')
    const output = path.join(dir, 'screen.mp4')
    fs.writeFileSync(input, 'mkv')
    const seen: string[] = []
    await remuxFile('ffmpeg', input, output, async (_bin, args) => {
      const target = args.at(-1)!
      seen.push(target)
      expect(fs.existsSync(output)).toBe(false)
      fs.writeFileSync(target, 'whole mp4')
    })
    expect(seen).toEqual([`${output}.remux.mp4`])
    expect(fs.readFileSync(output, 'utf8')).toBe('whole mp4')
    expect(fs.readdirSync(dir).sort()).toEqual(['screen.mkv', 'screen.mp4'])
  })

  it('leaves no screen.mp4 when ffmpeg dies part way, and keeps the mkv', async () => {
    const input = path.join(dir, 'screen.mkv')
    const output = path.join(dir, 'screen.mp4')
    fs.writeFileSync(input, 'the only copy')
    await expect(
      remuxFile('ffmpeg', input, output, async (_bin, args) => {
        // What a full disk looks like: some bytes written, then failure.
        fs.writeFileSync(args.at(-1)!, 'truncated, no moov')
        throw new Error('ffmpeg exited with 1: No space left on device')
      })
    ).rejects.toThrow('No space left')
    expect(fs.readdirSync(dir)).toEqual(['screen.mkv'])
    expect(fs.readFileSync(input, 'utf8')).toBe('the only copy')
  })
})

describe('remuxTimeoutMs', () => {
  it('is the base limit for an empty or unreadable file', () => {
    expect(remuxTimeoutMs(0, 20_000)).toBe(20_000)
    expect(remuxTimeoutMs(NaN, 20_000)).toBe(20_000)
    expect(remuxTimeoutMs(-5, 20_000)).toBe(20_000)
  })

  it('grows with the take, so a long one is not cut off mid-copy', () => {
    expect(remuxTimeoutMs(REMUX_MIN_BYTES_PER_SEC * 10, 20_000)).toBe(30_000)
    // An hour at ~20 Mbit/s is about 9 GB: over seven minutes at the floor speed.
    expect(remuxTimeoutMs(9 * 1024 ** 3, 20_000)).toBeGreaterThan(7 * 60_000)
  })
})

// The real bundled ffmpeg, so the renamed file is checked as an actual MP4.
// Skipped where ffmpeg-static has no binary.
import { execFileSync, spawnSync } from 'node:child_process'
import ffmpegStatic from 'ffmpeg-static'

const ffmpeg = typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic) ? ffmpegStatic : null

describe.skipIf(!ffmpeg)('remuxFile with real ffmpeg', () => {
  it('turns a gsr-style mkv into a playable mp4 and leaves nothing beside it', async () => {
    const input = path.join(dir, 'screen.mkv')
    const output = path.join(dir, 'screen.mp4')
    execFileSync(ffmpeg!, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=30', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', input])
    await remuxFile(ffmpeg!, input, output)
    const probe = spawnSync(ffmpeg!, ['-hide_banner', '-i', output, '-f', 'null', '-'], { encoding: 'utf8' })
    expect(probe.status).toBe(0)
    expect(probe.stderr).toMatch(/Duration: 00:00:02\.00/)
    expect(fs.readdirSync(dir).sort()).toEqual(['screen.mkv', 'screen.mp4'])
  })

  it('leaves the mkv and no mp4 when ffmpeg cannot read the take', async () => {
    const input = path.join(dir, 'screen.mkv')
    fs.writeFileSync(input, Buffer.alloc(4096, 7))
    await expect(remuxFile(ffmpeg!, input, path.join(dir, 'screen.mp4'))).rejects.toThrow(/ffmpeg exited/)
    expect(fs.readdirSync(dir)).toEqual(['screen.mkv'])
  })
})
