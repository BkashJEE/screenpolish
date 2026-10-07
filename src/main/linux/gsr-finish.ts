/**
 * Turning a gpu-screen-recorder take into the files the editor expects.
 *
 * gsr writes screen.mkv (crash-tolerant); it is remuxed, not re-encoded, into
 * screen.mp4. The microphone and webcam are recorded by the capture host,
 * which starts after gsr's first frame, so their t = 0 is a little later than
 * the screen's; they are padded by that much so all tracks share one clock.
 * And gsr rounds a region's output size (200x100 logical at 1.25 became
 * 252x126, not 250x125), so the logged pointer, measured against the
 * predicted size, is rescaled to the real one.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { FilePathSource, Input, MP4 } from 'mediabunny'
import type { RecordingEvents } from '@shared/types'

/** Below this the tracks are already in step; re-encoding would only cost quality. */
export const ALIGN_THRESHOLD_MS = 15

export function remuxArgs(input: string, output: string): string[] {
  return ['-nostdin', '-loglevel', 'error', '-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', output]
}

/**
 * Slowest copy speed a remux is given time for. It is a stream copy, so it
 * runs at disk speed; this is a slow USB hard drive, with room to spare.
 */
export const REMUX_MIN_BYTES_PER_SEC = 20 * 1024 ** 2

/**
 * How long a remux of `bytes` may take before it counts as hung. A fixed limit
 * was fine for a short take and wrong for an hour of 60 fps at 3440x1440,
 * which can be several gigabytes: the take was saved "without that step" while
 * ffmpeg was still writing it.
 */
export function remuxTimeoutMs(bytes: number, baseMs: number): number {
  const size = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return baseMs + Math.ceil((size / REMUX_MIN_BYTES_PER_SEC) * 1000)
}

/**
 * Remux into a side file and give it the real name only once it is whole.
 * ffmpeg writing straight to screen.mp4 left a truncated file, with no index,
 * whenever it died part way (a full disk, say) — and that file looked like a
 * finished take.
 */
export async function remuxFile(ffmpeg: string, input: string, output: string, run = runFfmpeg): Promise<void> {
  const tmp = `${output}.remux.mp4`
  try {
    await run(ffmpeg, remuxArgs(input, tmp))
    fs.renameSync(tmp, output)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

/**
 * ffmpeg arguments that shift a track to start `offsetMs` later (positive:
 * pad the start) or earlier (negative: drop its first moments), or null when
 * it is already within ALIGN_THRESHOLD_MS.
 */
export function alignArgs(kind: 'audio' | 'video', offsetMs: number, input: string, output: string): string[] | null {
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) < ALIGN_THRESHOLD_MS) return null
  const ms = Math.round(Math.abs(offsetMs))
  const head = ['-nostdin', '-loglevel', 'error', '-y']
  if (offsetMs < 0) {
    const seconds = (ms / 1000).toFixed(3)
    const codec = kind === 'audio' ? ['-c:a', 'aac', '-b:a', '160k'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an']
    return [...head, '-ss', seconds, '-i', input, ...codec, '-movflags', '+faststart', output]
  }
  if (kind === 'audio') return [...head, '-i', input, '-af', `adelay=${ms}:all=1`, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', output]
  // Hold the webcam's first frame for the gap rather than showing black.
  return [...head, '-i', input, '-vf', `tpad=start_duration=${(ms / 1000).toFixed(3)}:start_mode=clone`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-an', '-movflags', '+faststart', output]
}

/** Rescale every logged position by (fx, fy) and set the region to the real video size. */
export function rescaleEvents(events: RecordingEvents, size: { width: number; height: number }): RecordingEvents {
  const fx = events.region.width > 0 ? size.width / events.region.width : 1
  const fy = events.region.height > 0 ? size.height / events.region.height : 1
  if (Math.abs(fx - 1) < 1e-9 && Math.abs(fy - 1) < 1e-9) return events
  return {
    ...events,
    region: { ...events.region, width: size.width, height: size.height, scale: events.region.scale * fx },
    pointer: events.pointer.map(([t, x, y]) => [t, x * fx, y * fy]),
    clicks: events.clicks.map((c) => ({ ...c, x: c.x * fx, y: c.y * fy })),
    wheel: events.wheel.map((w) => ({ ...w, x: w.x * fx, y: w.y * fy }))
  }
}

export function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let tail = ''
    child.stderr.on('data', (c: Buffer) => (tail = (tail + c.toString()).slice(-2000)))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${tail.trim().split('\n').at(-1) ?? ''}`))))
  })
}

/** Shift a recorded track in place; leaves the original if ffmpeg fails. */
export async function alignFile(ffmpeg: string, file: string, kind: 'audio' | 'video', offsetMs: number): Promise<boolean> {
  if (!fs.existsSync(file)) return false
  const tmp = `${file}.aligned.mp4`
  const args = alignArgs(kind, offsetMs, file, tmp)
  if (!args) return false
  try {
    await runFfmpeg(ffmpeg, args)
    fs.renameSync(tmp, file)
    return true
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

/** Coded size of an MP4's video track, or null. */
export async function videoSize(file: string): Promise<{ width: number; height: number } | null> {
  const input = new Input({ formats: [MP4], source: new FilePathSource(file) })
  try {
    const track = await input.getPrimaryVideoTrack()
    return track ? { width: track.displayWidth, height: track.displayHeight } : null
  } catch {
    return null
  } finally {
    input.dispose()
  }
}
