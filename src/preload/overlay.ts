import { contextBridge, ipcRenderer } from 'electron'
import { OVERLAY, type OverlayBridge } from '../shared/ipc'

const bridge: OverlayBridge = {
  done: (rect) => ipcRenderer.send(OVERLAY.done, rect)
}

contextBridge.exposeInMainWorld('polishOverlay', bridge)
