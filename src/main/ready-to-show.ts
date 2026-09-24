/**
 * Run a window's "now show it" step exactly once, as soon as it can be shown.
 *
 * Electron's `ready-to-show` fires after the first paint of a hidden window.
 * On Omarchy (Wayland, software compositing) a window created with
 * `show: false` may never be painted, so the event never arrives and the
 * window stays invisible forever. The page finishing its load is the
 * fallback: a short grace period after `did-finish-load` still lets a normal
 * first paint win, which avoids flashing an unpainted window elsewhere.
 */

export interface ShowableWindow {
  once(event: 'ready-to-show', listener: () => void): unknown
  isDestroyed(): boolean
  webContents: { once(event: 'did-finish-load', listener: () => void): unknown }
}

export const SHOW_FALLBACK_MS = 400

export function whenReadyToShow(
  win: ShowableWindow,
  run: () => void,
  graceMs: number = SHOW_FALLBACK_MS,
  schedule: (fn: () => void, ms: number) => unknown = setTimeout
): void {
  let done = false
  const fire = (): void => {
    if (done || win.isDestroyed()) return
    done = true
    run()
  }
  win.once('ready-to-show', fire)
  win.webContents.once('did-finish-load', () => {
    schedule(fire, graceMs)
  })
}
