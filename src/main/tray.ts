// System tray: icon reflects state, menu mirrors the hotkeys.

import * as path from 'node:path'
import { Menu, Tray, app, nativeImage, type NativeImage } from 'electron'
import type { RecordingState } from '@shared/ipc'
import { loadSettings } from './settings'
import { DEFAULT_SHORTCUTS, shortcutLabel } from '@shared/shortcuts'

// 32×32 PNGs (generated: light disc with grey ring = idle, red disc = recording).
const ICON_IDLE_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA9UlEQVR4nM2Xyw3EIAxEc6AFWkgv9EIBXGiKGqghNUSaInYVCSTEYgdlIebgSwTMiz9gbwA2SXuySQMwACwAn8ymb3oWgEoiEcDnxmJaq0YBXIedWcA5x1oBcqa9jwEud4ZeYQYkcKGhxHcAByVMuZ9Ze6QzuwB0S7wj9iRMAfHjiRZA+FecgQh3AHaUOANhKQCVs32UeA1RVIdqAdgZ4gSEbQHEFwFiDaBHx74jF3QJYGb+PeEFUwJMjT+XBxnACwD4pQDEQyCehOJlKH4RLXEViz9G4s/xEg3JEi2ZeFO6RFteJ6bIYFKXqNho1grN68PpNPsCK9zECcCg4T4AAAAASUVORK5CYII='
const ICON_REC_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA5klEQVR4nM2XsQ3EIAxFU7ACK9wGLjwCu7ACS2UGZsgGlrLFRZGMxBHCIQSY4jdR4D9sA2YjhE1SLYM0IRhCsITgWJa/6VEAik08IXz/yPO/qhfAPdlZYZzq5LHNAHc49wbjVHspNW/mH0I4OpgHHTxnFYDubB5DPCKRA+gR9lI6igB2oHmQfQNQjdXesjtUDmDG6h9RiAFqDple8imAnmgepGMAIwBgYoCZ+f+pgwDgBADcUgDiKRAvQvFtKH4QLXEUi19G4tfxEg3JEi2ZeFO6RFueFqbIwyTdomJPs1xqpj9Oh+kCrEnd+uSxtTYAAAAASUVORK5CYII='

function icon(b64: string): NativeImage {
  return nativeImage.createFromBuffer(Buffer.from(b64, 'base64'), { scaleFactor: 2 })
}

/** The app logo at 32px for the idle tray; falls back to the generated disc if the file is missing. */
function logoIcon(): NativeImage {
  const img = nativeImage.createFromPath(path.join(app.getAppPath(), 'resources', 'tray.png'))
  return img.isEmpty() ? icon(ICON_IDLE_B64) : nativeImage.createFromBuffer(img.toPNG(), { scaleFactor: 2 })
}

export interface TrayActions {
  recordScreen: () => void
  recordRegion: () => void
  stop: () => void
  togglePause: () => void
  openLibrary: () => void
  /** Replay buffer: hold the last N seconds, save what is held, stop holding. */
  startReplay: () => void
  saveReplay: () => void
  stopReplay: () => void
  /** Whether a buffer is currently running, read when the menu is rebuilt. */
  replayRunning: () => boolean
  /**
   * Whether this machine can hold a replay buffer at all. Where it cannot, the
   * entries are left out rather than offered and then refused.
   */
  replayAvailable: () => boolean

  quit: () => void
}

export interface TrayHandle {
  update: (state: RecordingState) => void
  setExportProgress: (fraction: number | null) => void
  destroy: () => void
}

export function createTray(actions: TrayActions): TrayHandle {
  const idleIcon = logoIcon()
  const recIcon = icon(ICON_REC_B64)
  const tray = new Tray(idleIcon)
  let state: RecordingState = { status: 'idle' }
  let exportProgress: number | null = null
  // What the tray is already showing. Setting the same image again republishes
  // it over the StatusNotifierItem interface, and a tray that reloads an icon on
  // every state change can take its host down with it: Omarchy's quickshell
  // crashed in its pixmap reader four times during two short recordings, each
  // crash landing on the second a take started or finished.
  let shown = idleIcon

  const tooltip = (): string => {
    if (exportProgress !== null) return `ScreenPolish — exporting ${Math.round(exportProgress * 100)}%`
    switch (state.status) {
      case 'recording':
        return state.paused ? 'ScreenPolish — paused' : `ScreenPolish — recording (${shortcutLabel((loadSettings().shortcuts ?? DEFAULT_SHORTCUTS).stop)} to stop)`
      case 'countdown':
        return `ScreenPolish — starting in ${state.seconds}`
      case 'finalizing':
        return 'ScreenPolish — finishing…'
      case 'picking':
        return 'ScreenPolish — pick a region'
      default:
        return `ScreenPolish — ${shortcutLabel((loadSettings().shortcuts ?? DEFAULT_SHORTCUTS).record)} to record`
    }
  }

  const render = (): void => {
    const shortcuts = loadSettings().shortcuts ?? DEFAULT_SHORTCUTS
    const idle = state.status === 'idle'
    const recording = state.status === 'recording'
    const busy = state.status === 'countdown' || recording
    const wanted = busy ? recIcon : idleIcon
    if (wanted !== shown) {
      tray.setImage(wanted)
      shown = wanted
    }
    tray.setToolTip(tooltip())
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Record screen', accelerator: shortcuts.record, enabled: idle, click: actions.recordScreen },
        { label: 'Record region…', enabled: idle, click: actions.recordRegion },
        { type: 'separator' },
        { label: 'Stop recording', accelerator: shortcuts.stop, enabled: busy, click: actions.stop },
        {
          label: state.status === 'recording' && state.paused ? 'Resume' : 'Pause',
          accelerator: shortcuts.pause,
          enabled: recording,
          click: actions.togglePause
        },
        { type: 'separator' },
        // The replay buffer cannot share the screen with a recording, so it is
        // only offered when there is no take running.
        ...(!actions.replayAvailable()
          ? []
          : actions.replayRunning()
            ? [
                { label: `Save replay  ${shortcutLabel(shortcuts.saveReplay)}`, click: actions.saveReplay },
                { label: 'Stop replay buffer', click: actions.stopReplay },
                { type: 'separator' as const }
              ]
            : [{ label: 'Start replay buffer (30s)', enabled: idle, click: actions.startReplay }, { type: 'separator' as const }]),
        { label: 'Open library', click: actions.openLibrary },

        { type: 'separator' },
        { label: 'Quit ScreenPolish', click: actions.quit }
      ])
    )
  }

  tray.on('click', () => {
    if (state.status === 'recording' || state.status === 'countdown') actions.stop()
    else actions.openLibrary()
  })
  render()

  return {
    update(next) {
      state = next
      render()
    },
    setExportProgress(fraction) {
      exportProgress = fraction
      tray.setToolTip(tooltip())
    },
    destroy() {
      tray.destroy()
    }
  }
}
