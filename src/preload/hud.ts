import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { HudBridge, RecordingState } from '../shared/ipc'

// Channel names are inlined on purpose: this preload runs sandboxed, and a
// sandboxed preload cannot require the shared chunk Vite would split the
// runtime constants into. They must match HUD in src/shared/ipc.ts.
const STATE = 'polish:hud:state'
const STOP = 'polish:hud:stop'
const TOGGLE_PAUSE = 'polish:hud:toggle-pause'

const bridge: HudBridge = {
  onState: (handler) => {
    const listener = (_event: IpcRendererEvent, state: RecordingState): void => handler(state)
    ipcRenderer.on(STATE, listener)
    return () => ipcRenderer.removeListener(STATE, listener)
  },
  stop: () => ipcRenderer.send(STOP),
  togglePause: () => ipcRenderer.send(TOGGLE_PAUSE)
}

contextBridge.exposeInMainWorld('polishHud', bridge)
