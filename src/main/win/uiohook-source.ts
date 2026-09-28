// Global input source for Windows and macOS, on uiohook-napi.
//
// Linux never loads this: uiohook is X11-only, and a Wayland compositor gives
// no client a global input stream (see ../linux/input-source.ts). It is the
// only place uiohook is referenced, so a build without Windows and macOS
// support replaces this one file.

import type { UiohookKeyboardEvent, UiohookMouseEvent, UiohookWheelEvent } from 'uiohook-napi'
import type { MouseButton } from '@shared/types'
import { mapButton, wheelDy } from '../input-math'

/** What the logger wants from any platform source. Screen coordinates, in the platform's own units. */
export interface InputHandlers {
  onMove: (x: number, y: number) => void
  onButton: (x: number, y: number, button: MouseButton, down: boolean) => void
  onWheel: (x: number, y: number, dy: number) => void
  onKey: (key: string, down: boolean) => void
}

type Uiohook = typeof import('uiohook-napi').uIOhook

/**
 * uiohook is loaded lazily and never on Linux. Importing it initialises
 * libuiohook's X11 side at module load: on a machine with no usable X display
 * that throws ("Couldn't find per display information"), which would take the
 * whole main process down on a Wayland session that never needed the hook.
 */
let uIOhook: Uiohook | null = null

/** True where this source can work at all. */
export const UIOHOOK_SUPPORTED = process.platform !== 'linux'

/** Warm the hook at startup so starting a recording can stay synchronous. No-op on Linux. */
export async function preloadInputHook(): Promise<void> {
  if (!UIOHOOK_SUPPORTED || uIOhook) return
  try {
    uIOhook = (await import('uiohook-napi')).uIOhook
  } catch (err) {
    // Recording still works without an input log; the editor just has no cursor to draw.
    console.error('[input] uiohook could not be loaded', err)
  }
}

export class UiohookSource {
  private hooked = false
  private handlers: InputHandlers | null = null

  private readonly onMouseMove = (e: UiohookMouseEvent): void => this.handlers?.onMove(e.x, e.y)
  private readonly onMouseDown = (e: UiohookMouseEvent): void => this.click(e, true)
  private readonly onMouseUp = (e: UiohookMouseEvent): void => this.click(e, false)
  private readonly onWheelEvent = (e: UiohookWheelEvent): void => this.handlers?.onWheel(e.x, e.y, wheelDy(e.rotation))
  private readonly onKeyDown = (e: UiohookKeyboardEvent): void => this.handlers?.onKey(String(e.keycode), true)
  private readonly onKeyUp = (e: UiohookKeyboardEvent): void => this.handlers?.onKey(String(e.keycode), false)

  start(handlers: InputHandlers): void {
    this.handlers = handlers
    uIOhook?.on('mousemove', this.onMouseMove)
    uIOhook?.on('mousedown', this.onMouseDown)
    uIOhook?.on('mouseup', this.onMouseUp)
    uIOhook?.on('wheel', this.onWheelEvent)
    uIOhook?.on('keydown', this.onKeyDown)
    uIOhook?.on('keyup', this.onKeyUp)
    try {
      uIOhook?.start()
      this.hooked = true
    } catch (err) {
      // Recording still works without an input log; the editor just has no cursor to draw.
      console.error('[input] uiohook failed to start', err)
    }
  }

  stop(): void {
    uIOhook?.off('mousemove', this.onMouseMove)
    uIOhook?.off('mousedown', this.onMouseDown)
    uIOhook?.off('mouseup', this.onMouseUp)
    uIOhook?.off('wheel', this.onWheelEvent)
    uIOhook?.off('keydown', this.onKeyDown)
    uIOhook?.off('keyup', this.onKeyUp)
    if (this.hooked) {
      try {
        uIOhook?.stop()
      } catch (err) {
        console.error('[input] uiohook failed to stop', err)
      }
      this.hooked = false
    }
    this.handlers = null
  }

  private click(e: UiohookMouseEvent, down: boolean): void {
    const button = mapButton(e.button)
    if (button) this.handlers?.onButton(e.x, e.y, button, down)
  }
}
