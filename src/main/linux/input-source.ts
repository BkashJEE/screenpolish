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

export class LinuxInputSource {
  private handlers: InputSourceHandlers | null = null
  private timer: NodeJS.Timeout | null = null
  private streams: fs.ReadStream[] = []
  private last: [number, number] = [0, 0]
  private polling = false

  start(handlers: InputSourceHandlers): InputCapabilities {
    this.stop()
    this.handlers = handlers
    const pointer = this.startPointer()
    const buttons = this.startDevices()
    const missing: string[] = []
    if (!pointer) missing.push('the compositor did not answer (Hyprland IPC unavailable), so there is no pointer path')
    if (!buttons) missing.push('no mouse device could be opened, so clicks and automatic click zoom are unavailable. Add your user to the `input` group and log back in (that group can also read keyboards)')
    return { pointer, buttons, ...(missing.length ? { reason: missing.join('; ') } : {}) }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const stream of this.streams) stream.destroy()
    this.streams = []
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

  private startDevices(): boolean {
    let nodes: string[]
    try {
      nodes = eventNodesFrom(fs.readFileSync('/proc/bus/input/devices', 'utf8'), ['mouse'])
    } catch {
      return false
    }
    for (const node of nodes) {
      let fd: number | undefined
      try {
        // createReadStream opens asynchronously: counting it before `open`
        // incorrectly advertised click capture even after EACCES. Open the
        // mouse node first so the recording-start warning reflects permission.
        fd = fs.openSync(node, 'r')
        const stream = fs.createReadStream(node, { fd, autoClose: true })
        fd = undefined // ownership transferred to the stream
        let rest: Buffer = Buffer.alloc(0)
        stream.on('data', (chunk) => {
          const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
          const decoded = decodeEvents(Buffer.concat([rest, buf]))
          rest = decoded.rest
          for (const event of decoded.events) this.dispatch(event.type, event.code, event.value)
        })
        // A device can disappear mid-recording (unplugged mouse); that must not crash the app.
        stream.on('error', () => stream.destroy())
        this.streams.push(stream)
      } catch {
        if (fd !== undefined) fs.closeSync(fd)
        // Unreadable node: keep trying the others.
      }
    }
    return this.streams.length > 0
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
