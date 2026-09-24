import { describe, expect, it, vi } from 'vitest'
import { whenReadyToShow, type ShowableWindow } from './ready-to-show'

function fakeWindow() {
  const listeners: Record<string, () => void> = {}
  let destroyed = false
  const win: ShowableWindow = {
    once: (event, listener) => { listeners[event] = listener },
    isDestroyed: () => destroyed,
    webContents: { once: (event, listener) => { listeners[event] = listener } }
  }
  const timers: Array<() => void> = []
  return {
    win,
    emit: (event: string) => listeners[event]?.(),
    destroy: () => { destroyed = true },
    schedule: (fn: () => void) => { timers.push(fn) },
    flushTimers: () => timers.splice(0).forEach((fn) => fn())
  }
}

describe('whenReadyToShow', () => {
  it('shows on the first paint and not again after the load fallback', () => {
    const w = fakeWindow()
    const run = vi.fn()
    whenReadyToShow(w.win, run, 400, w.schedule)
    w.emit('ready-to-show')
    w.emit('did-finish-load')
    w.flushTimers()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('still shows when the window is never painted (Wayland software compositing)', () => {
    const w = fakeWindow()
    const run = vi.fn()
    whenReadyToShow(w.win, run, 400, w.schedule)
    w.emit('did-finish-load')
    expect(run).not.toHaveBeenCalled()
    w.flushTimers()
    expect(run).toHaveBeenCalledTimes(1)
    w.emit('ready-to-show')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a window closed before it could show', () => {
    const w = fakeWindow()
    const run = vi.fn()
    whenReadyToShow(w.win, run, 400, w.schedule)
    w.emit('did-finish-load')
    w.destroy()
    w.flushTimers()
    expect(run).not.toHaveBeenCalled()
  })
})
