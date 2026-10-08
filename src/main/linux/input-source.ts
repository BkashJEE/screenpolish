/**
 * The Linux replacement for the uiohook global input hook.
 *
 * Wayland deliberately denies clients a global input stream, so there is no
 * portable hook to install: uiohook is X11-only and under Hyprland it sees
 * nothing. This source reassembles the same event log from two lower-level
 * places instead.
 *
 *   pointer position  <- the compositor, over Hyprland's IPC socket
 *   buttons and wheel <- /dev/input/event* (evdev), read directly
 *
 * Either half can be unavailable without taking the other down: evdev needs the
 * user to be in the `input` group, and the compositor half only works under
 * Hyprland. `start()` reports what it actually got so the UI can say which
 * effects will work rather than silently recording a dead event log.
 *
 * Keyboards are deliberately NOT opened. Nothing consumes the key log yet, and
 * opening every `kbd` device would mean reading a global keystroke stream —
 * including passwords typed into other applications — to populate a field no
 * feature reads. Windows records keys through uiohook; on Linux this stays off
 * until something needs it.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import * as fs from 'node:fs'
import type { MouseButton } from '@shared/types'
import { EV_KEY, EV_REL, decodeEvents, mapEvdevButton, wheelDyFromEvdev, eventNodesFrom } from './evdev'
import { cursorPos, hyprSocketPaths, isHyprland } from './hypr'

/** ~60 Hz, matching the fastest frame rate the recorder offers. */
export const CURSOR_POLL_MS = 16

export interface InputSourceHandlers {
  onMove(x: number, y: number): void
  onButton(x: number, y: number, button: MouseButton, down: boolean): void
  onWheel(x: number, y: number, dy: number): void
}

export interface InputCapabilities {
  /** Pointer path available: auto-zoom focus and cursor smoothing will work. */
  pointer: boolean
  /** Buttons and wheel available: click clusters, ripples and scroll-driven zoom will work. */
  buttons: boolean
  /** Why something is missing, for the UI to show. Absent when everything works. */
  reason?: string
}

/** Mouse event nodes, from the kernel's device list. */
export function mouseNodes(): string[] {
  return eventNodesFrom(fs.readFileSync('/proc/bus/input/devices', 'utf8'), ['mouse'])
}

export interface InputSourceOptions {
  /** Event nodes to read. Defaults to every mouse the kernel lists. */
  devices?: () => string[]
  /** Follow the pointer over Hyprland IPC. Defaults to on. */
  pointer?: boolean
}

export class LinuxInputSource {
  private handlers: InputSourceHandlers | null = null
  private timer: NodeJS.Timeout | null = null
  private readers: ChildProcess[] = []
  private last: [number, number] = [0, 0]
  private polling = false

  constructor(private readonly options: InputSourceOptions = {}) {}

  start(handlers: InputSourceHandlers): InputCapabilities {
    this.stop()
    this.handlers = handlers
    const pointer = this.options.pointer === false ? false : this.startPointer()
    const buttons = this.startDevices()
    const missing: string[] = []
    if (!pointer) missing.push('the compositor did not answer (Hyprland IPC unavailable), so there is no pointer path')
    if (!buttons) missing.push('no mouse device could be opened, so clicks and automatic click zoom are unavailable. Add your user to the `input` group and log back in (that group can also read keyboards)')
    return { pointer, buttons, ...(missing.length ? { reason: missing.join('; ') } : {}) }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const reader of this.readers) reader.kill()
    this.readers = []
    this.handlers = null
  }

  /** Last known pointer position, used to stamp clicks that evdev reports without coordinates. */
  get position(): [number, number] {
    return this.last
  }

  private startPointer(): boolean {
    if (!isHyprland()) return false
    const paths = hyprSocketPaths(process.env)
    if (paths.length === 0) return false
    const poll = (): void => {
      // Skip a tick rather than queue: a slow answer must not build a backlog.
      if (this.polling) return
      this.polling = true
      void cursorPos(paths)
        .then((pos) => {
          if (!pos || !this.handlers) return
          this.last = pos
          this.handlers.onMove(pos[0], pos[1])
        })
        .finally(() => {
          this.polling = false
        })
    }
    // Prime the click position immediately; otherwise a click in the first
    // timer interval would be stamped at the initial (0, 0).
    poll()
    this.timer = setInterval(poll, CURSOR_POLL_MS)
    return true
  }

  /**
   * Read each mouse through its own `cat`, not through Node's file streams.
   *
   * A read on an evdev node blocks until the device sends something, and Node
   * runs blocking reads on its small shared thread pool (four threads), the same
   * pool every asynchronous file operation in the app waits on. Destroying the
   * stream does not end a read already in progress, so a quiet device — the
   * "passthrough" nodes some receivers expose rarely send anything — kept its
   * thread after the recording stopped. Two takes on a machine with three mouse
   * nodes used up the pool for good: converting the next take timed out,
   * exports sat at 0 bytes, and the app could not even exit.
   *
   * A child reads in its own process, Node only watches the pipe, and killing
   * the child ends a read that is still waiting.
   */
  private startDevices(): boolean {
    let nodes: string[]
    try {
      nodes = (this.options.devices ?? mouseNodes)()
    } catch {
      return false
    }
    for (const node of nodes) {
      // Check permission here, so the recording-start warning is true; the
      // child's own open would only fail later and silently.
      try {
        fs.accessSync(node, fs.constants.R_OK)
      } catch {
        continue
      }
      let reader: ChildProcess
      try {
        reader = spawn('cat', [node], { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        continue
      }
      let rest: Buffer = Buffer.alloc(0)
      reader.stdout?.on('data', (chunk: Buffer) => {
        const decoded = decodeEvents(Buffer.concat([rest, chunk]))
        rest = decoded.rest
        for (const event of decoded.events) this.dispatch(event.type, event.code, event.value)
      })
      // A device can disappear mid-recording (unplugged mouse); that must not crash the app.
      reader.on('error', () => undefined)
      this.readers.push(reader)
    }
    return this.readers.length > 0
  }

  private dispatch(type: number, code: number, value: number): void {
    const handlers = this.handlers
    if (!handlers) return
    const [x, y] = this.last
    if (type === EV_KEY) {
      const button = mapEvdevButton(code)
      if (button && (value === 0 || value === 1)) handlers.onButton(x, y, button, value === 1)
      return
    }
    if (type === EV_REL) {
      const dy = wheelDyFromEvdev(code, value)
      if (dy !== 0) handlers.onWheel(x, y, dy)
    }
  }
}
