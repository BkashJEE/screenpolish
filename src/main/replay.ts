/**
 * The replay buffer: holding the last N seconds so they can be kept after the
 * fact.
 *
 * Every other way of recording asks you to know in advance that something is
 * worth filming. This one does not — you notice the bug, or the thing that
 * worked first time, and it is still there to save.
 *
 * Kept out of RecordingSession deliberately. The two cannot run at once and
 * share nothing: a recording writes one take and finalizes it, while this
 * writes nothing until told, and each save is its own clip.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { GsrReplay, findGsr, gsrReplayArgs, planNativeCapture, type GsrMonitor } from './linux/gsr'
import { snapshotCaptureTargets, type HyprMonitor } from './linux/capture-target'
import { listsThroughPortal } from './sources'

export interface ReplayState {
  running: boolean
  /** Seconds of history held. */
  seconds: number
  /** Where saved clips land. */
  directory: string
  /** Clips written since this buffer started. */
  saved: number
}

/** Saved clips go beside the recordings, in their own folder. */
export const REPLAY_DIR_NAME = 'Replays'

export function replayDirectory(root: string): string {
  return path.join(root, REPLAY_DIR_NAME)
}

/** Files gsr has written into the replay directory, newest first. */
export function clipsIn(directory: string, readdir = fs.readdirSync, stat = fs.statSync): string[] {
  let names: string[]
  try {
    names = readdir(directory) as unknown as string[]
  } catch {
    return []
  }
  return names
    .filter((n) => n.endsWith('.mp4') || n.endsWith('.mkv'))
    .map((n) => path.join(directory, n))
    .map((file) => ({ file, at: (() => { try { return stat(file).mtimeMs } catch { return 0 } })() }))
    .sort((a, b) => b.at - a.at)
    .map((e) => e.file)
}

/**
 * Wait for gsr to finish writing a clip it has just started.
 *
 * gsr creates the file first and fills it afterwards, so "a new file appeared"
 * is not the same as "a clip is ready". Returning on the first sight of it
 * handed back a path to a file still being written - fine for a ten second
 * buffer that flushes at once, a truncated clip for a ten minute one.
 *
 * Done once the file has held the same non-zero size across `stablePolls`
 * consecutive checks.
 */
export async function waitForFinishedClip(
  directory: string,
  before: ReadonlySet<string>,
  opts: { timeoutMs?: number; pollMs?: number; stablePolls?: number } = {},
  io: { list: (dir: string) => string[]; size: (file: string) => number; sleep: (ms: number) => Promise<void> } = {
    list: (dir) => clipsIn(dir),
    size: (file) => { try { return fs.statSync(file).size } catch { return -1 } },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms))
  }
): Promise<string | null> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const pollMs = opts.pollMs ?? 250
  const stablePolls = opts.stablePolls ?? 2
  const deadline = Date.now() + timeoutMs
  let clip: string | null = null
  let lastSize = -1
  let stable = 0
  while (Date.now() < deadline) {
    if (!clip) clip = io.list(directory).find((f) => !before.has(f)) ?? null
    if (clip) {
      const size = io.size(clip)
      if (size > 0 && size === lastSize) {
        stable += 1
        if (stable >= stablePolls) return clip
      } else {
        stable = 0
      }
      lastSize = size
    }
    await io.sleep(pollMs)
  }
  // Out of time. A clip that exists but never settled is still worth naming,
  // since the caller can look at it; one that never appeared is not.
  return clip
}

export class ReplayBuffer {
  private gsr: GsrReplay | null = null
  private seconds = 0
  private directory = ''
  private savedCount = 0

  get state(): ReplayState {
    return { running: this.gsr?.running === true, seconds: this.seconds, directory: this.directory, saved: this.savedCount }
  }

  get running(): boolean {
    return this.gsr?.running === true
  }

  /**
   * Begin holding history for the given display. Linux only, and only where
   * capture goes through the portal — the same ground the cursor-free
   * recording path stands on.
   */
  async start(opts: { root: string; displayBounds: { x: number; y: number; width: number; height: number }; seconds: number; fps: number }): Promise<ReplayState> {
    if (this.running) throw new Error('A replay buffer is already running')
    if (process.platform !== 'linux' || !listsThroughPortal()) {
      throw new Error('The replay buffer needs gpu-screen-recorder, which is the Linux capture path')
    }
    const bin = findGsr()
    if (!bin) throw new Error('gpu-screen-recorder was not found on PATH, so there is nothing to hold a buffer')

    const snapshot = await snapshotCaptureTargets()
    if (!snapshot) throw new Error('Hyprland did not report its monitors')
    const monitors: GsrMonitor[] = snapshot.monitors.flatMap((m: HyprMonitor) =>
      m.name ? [{ name: m.name, x: m.x, y: m.y, width: m.width, height: m.height, scale: m.scale, transform: m.transform }] : []
    )
    const plan = planNativeCapture({ kind: 'screen', monitors, displayBounds: opts.displayBounds, window: null })
    if ('skip' in plan) throw new Error(`Cannot hold a replay buffer: ${plan.skip}`)

    const directory = replayDirectory(opts.root)
    const args = gsrReplayArgs({ target: plan.target, fps: opts.fps, seconds: opts.seconds, directory })
    const gsr = new GsrReplay(bin, args, directory)
    await gsr.start()
    this.gsr = gsr
    this.directory = directory
    this.seconds = opts.seconds
    this.savedCount = 0
    return this.state
  }

  /**
   * Write what is held to a clip. gsr does this asynchronously, so the new file
   * is found by looking rather than by being told.
   */
  async save(): Promise<{ clip: string | null; state: ReplayState }> {
    if (!this.gsr || !this.running) throw new Error('No replay buffer is running. Start one with `polish replay start --seconds N`.')
    const before = new Set(clipsIn(this.directory))
    this.gsr.save()
    const clip = await waitForFinishedClip(this.directory, before)
    if (clip) this.savedCount += 1
    return { clip, state: this.state }
  }

  async stop(): Promise<ReplayState> {
    if (this.gsr) await this.gsr.stop()
    this.gsr = null
    return this.state
  }
}

export const replayBuffer = new ReplayBuffer()
