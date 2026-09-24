/**
 * Cursor-free screen recording on Linux with gpu-screen-recorder.
 *
 * Chromium always paints the system cursor into screen captures on Wayland
 * (it does not support getDisplayMedia's `cursor: 'never'`), so every Linux
 * take had the real cursor baked in and no ScreenPolish pointer could be drawn
 * over it. gpu-screen-recorder (Omarchy's own recorder) captures through KMS
 * with `-cursor no`, without the share dialog: a monitor by name, or any
 * logical-pixel rectangle, which is also how a window is recorded.
 *
 * It encodes on the GPU where it can and falls back to the CPU otherwise
 * (NVENC fails on a driver older than its FFmpeg's API). The first-frame
 * timestamp it writes beside the file is the take's t = 0.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const GSR_BIN = 'gpu-screen-recorder'

/** How long to wait for the first frame before giving up on gsr. */
export const GSR_FIRST_FRAME_TIMEOUT_MS = 8000
/** How long SIGINT gets to finish the file before SIGKILL. */
export const GSR_STOP_TIMEOUT_MS = 8000

/** First executable `gpu-screen-recorder` on PATH, or null. */
export function findGsr(envPath = process.env.PATH ?? '', exists: (p: string) => boolean = isExecutable): string | null {
  for (const dir of envPath.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, GSR_BIN)
    if (exists(candidate)) return candidate
  }
  return null
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** A rectangle in the compositor's logical coordinates, as Hyprland reports them. */
export interface LogicalRect {
  x: number
  y: number
  width: number
  height: number
}

/** gsr's region target, "WxH+X+Y" in logical pixels; it scales to physical itself. */
export function regionTarget(r: LogicalRect): string {
  const x = Math.round(r.x)
  const y = Math.round(r.y)
  const w = Math.max(2, Math.round(r.width))
  const h = Math.max(2, Math.round(r.height))
  return `${w}x${h}+${x}+${y}`
}

export interface GsrMonitor {
  name: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  transform?: number
}

/** A monitor's logical rectangle: Hyprland reports physical size and a scale. */
export function monitorLogicalRect(m: GsrMonitor): LogicalRect {
  const rotated = m.transform !== undefined && m.transform % 2 === 1
  const w = (rotated ? m.height : m.width) / (m.scale > 0 ? m.scale : 1)
  const h = (rotated ? m.width : m.height) / (m.scale > 0 ? m.scale : 1)
  return { x: m.x, y: m.y, width: w, height: h }
}

/** The monitor that wholly contains a logical rectangle, or null (off-screen, or spanning two). */
export function monitorContaining(r: LogicalRect, monitors: readonly GsrMonitor[]): GsrMonitor | null {
  const slack = 1
  return (
    monitors.find((m) => {
      const b = monitorLogicalRect(m)
      return r.x >= b.x - slack && r.y >= b.y - slack && r.x + r.width <= b.x + b.width + slack && r.y + r.height <= b.y + b.height + slack
    }) ?? null
  )
}

/** The monitor whose logical rectangle matches a display's bounds. */
export function monitorForBounds(bounds: LogicalRect, monitors: readonly GsrMonitor[]): GsrMonitor | null {
  return (
    monitors.find((m) => {
      const b = monitorLogicalRect(m)
      return Math.abs(b.x - bounds.x) <= 2 && Math.abs(b.y - bounds.y) <= 2 && Math.abs(b.width - bounds.width) <= 2 && Math.abs(b.height - bounds.height) <= 2
    }) ?? null
  )
}

export function gsrArgs(opts: { target: string; fps: number; output: string }): string[] {
  return [
    '-w', opts.target,
    // Matroska survives an interrupted take; it is remuxed to screen.mp4 at the end.
    '-c', 'mkv',
    '-k', 'auto',
    '-f', String(opts.fps),
    '-fm', 'cfr',
    '-cursor', 'no',
    '-fallback-cpu-encoding', 'yes',
    '-write-first-frame-ts', 'yes',
    '-o', opts.output
  ]
}

/**
 * The first frame's wall-clock time in ms from gsr's timestamp file, which is
 * a header line then "monotonic_microsec<TAB>realtime_microsec".
 */
export function parseFirstFrameTs(text: string): number | null {
  for (const line of text.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length >= 2 && /^\d+$/.test(cols[1])) return Math.round(Number(cols[1]) / 1000)
  }
  return null
}

/** Running gpu-screen-recorder for one take. */
export class GsrRecording {
  private child: ChildProcess | null = null
  private stderrTail = ''
  private exited: Promise<number | null> | null = null

  constructor(readonly bin: string, readonly args: string[], readonly output: string) {}

  /** Starts gsr and resolves with the first frame's wall-clock ms. */
  async start(timeoutMs = GSR_FIRST_FRAME_TIMEOUT_MS): Promise<number> {
    const tsFile = `${this.output}.ts`
    fs.rmSync(tsFile, { force: true })
    const child = spawn(this.bin, this.args, { stdio: ['ignore', 'ignore', 'pipe'] })
    this.child = child
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-4000)
    })
    this.exited = new Promise((resolve) => {
      child.on('exit', (code) => resolve(code))
      child.on('error', () => resolve(-1))
    })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const ts = fs.existsSync(tsFile) ? parseFirstFrameTs(fs.readFileSync(tsFile, 'utf8')) : null
      if (ts !== null) return ts
      if (child.exitCode !== null || child.signalCode !== null) break
      await new Promise((r) => setTimeout(r, 50))
    }
    await this.kill()
    throw new Error(`gpu-screen-recorder did not start: ${this.reason()}`)
  }

  /** gsr toggles pause on SIGUSR2; the paused stretch is left out of the file. */
  togglePause(): void {
    this.child?.kill('SIGUSR2')
  }

  /** SIGINT lets gsr finish the file; SIGKILL only if it does not exit in time. */
  async stop(timeoutMs = GSR_STOP_TIMEOUT_MS): Promise<void> {
    if (!this.child || !this.exited) return
    this.child.kill('SIGINT')
    const code = await Promise.race([this.exited, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), timeoutMs))])
    if (code === 'timeout') await this.kill()
  }

  async kill(): Promise<void> {
    if (!this.child || !this.exited) return
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill('SIGKILL')
    await this.exited
  }

  /** The last meaningful gsr error line, for a message fit to show. */
  reason(): string {
    const lines = this.stderrTail.split('\n').map((l) => l.trim()).filter(Boolean)
    const error = [...lines].reverse().find((l) => /error/i.test(l))
    return error ?? lines.at(-1) ?? 'no output'
  }
}

/** Physical-pixel capture region, as the input logger and editor use it. */
export interface PhysicalRegion {
  x: number
  y: number
  width: number
  height: number
  scale: number
}

export type NativePlan = { target: string; region: PhysicalRegion; label: string } | { skip: string }

const even = (n: number) => Math.max(2, 2 * Math.round(n / 2))

function physical(r: LogicalRect, scale: number): PhysicalRegion {
  return { x: Math.round(r.x * scale), y: Math.round(r.y * scale), width: even(r.width * scale), height: even(r.height * scale), scale }
}

/**
 * What gsr should record for a take, and the region the pointer log maps
 * into; or why it cannot, so the take falls back to the share dialog.
 * `window` is the picked window's logical rectangle, read after the countdown
 * (hiding the editor can re-tile the layout).
 */
export function planNativeCapture(args: {
  kind: 'screen' | 'region' | 'window'
  monitors: readonly GsrMonitor[]
  /** Screen: the display's logical bounds. */
  displayBounds?: LogicalRect
  /** Region: the picked rectangle, physical px, with its scale. */
  region?: PhysicalRegion
  window?: (LogicalRect & { title?: string }) | null
}): NativePlan {
  if (args.kind === 'screen') {
    const m = args.displayBounds ? monitorForBounds(args.displayBounds, args.monitors) : null
    if (!m) return { skip: 'the display could not be matched to a monitor' }
    return { target: m.name, region: physical(monitorLogicalRect(m), m.scale), label: m.name }
  }
  if (args.kind === 'region') {
    const r = args.region
    if (!r || !(r.scale > 0)) return { skip: 'no region was picked' }
    const logical = { x: r.x / r.scale, y: r.y / r.scale, width: r.width / r.scale, height: r.height / r.scale }
    if (!monitorContaining(logical, args.monitors)) return { skip: 'the region spans more than one monitor' }
    return { target: regionTarget(logical), region: { ...r }, label: 'Region' }
  }
  const w = args.window
  if (!w) return { skip: 'the window is no longer open' }
  const m = monitorContaining(w, args.monitors)
  if (!m) return { skip: 'the window is not wholly on one screen (scrolled off, or across two monitors)' }
  return { target: regionTarget(w), region: physical(w, m.scale), label: w.title || 'Window' }
}
