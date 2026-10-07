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

export class ReplayBuffer {
  /**
   * Told whenever the buffer starts, stops, or dies. The tray menu used to be
   * rebuilt only on recording changes, so a buffer started by an agent left it
   * still offering "Start", and one that crashed left it offering "Save".
   */
  onChange: (() => void) | null = null
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
    // gsr can die without being asked - out of memory, a monitor unplugged.
    gsr.onExit = () => {
      if (this.gsr === gsr) this.gsr = null
      this.onChange?.()
    }
    await gsr.start()
    this.gsr = gsr
    this.directory = directory
    this.seconds = opts.seconds
    this.savedCount = 0
    this.onChange?.()
    return this.state
  }

  /**
   * Write what is held to a clip. gsr does this asynchronously, so the new file
   * is found by looking rather than by being told.
   */
  async save(settleMs = 1500): Promise<{ clip: string | null; state: ReplayState }> {
    if (!this.gsr || !this.running) throw new Error('No replay buffer is running. Start one with `polish replay start --seconds N`.')
    const before = new Set(clipsIn(this.directory))
    this.gsr.save()
    await new Promise((r) => setTimeout(r, settleMs))
    const clip = clipsIn(this.directory).find((f) => !before.has(f)) ?? null
    if (clip) this.savedCount += 1
    return { clip, state: this.state }
  }

  async stop(): Promise<ReplayState> {
    const gsr = this.gsr
    this.gsr = null
    if (gsr) await gsr.stop()
    this.onChange?.()
    return this.state
  }
}

export const replayBuffer = new ReplayBuffer()
