import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { GhostBridge } from '../shared/ipc'

// Channel name is inlined on purpose: this preload runs sandboxed, and a
// sandboxed preload cannot require the shared chunk Vite would split the
// runtime constants into. It must match GHOST in src/shared/ipc.ts.
const POINT = 'polish:ghost:point'

const bridge: GhostBridge = {
  onPoint: (handler) => {
    const listener = (_event: IpcRendererEvent, point: { x: number; y: number }): void => handler(point)
    ipcRenderer.on(POINT, listener)
    return () => ipcRenderer.removeListener(POINT, listener)
  }
}

contextBridge.exposeInMainWorld('polishGhost', bridge)
