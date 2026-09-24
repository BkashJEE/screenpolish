import { contextBridge, ipcRenderer } from 'electron'
import { CAPTURE, type CaptureBridge, type CaptureStartMessage } from '../shared/ipc'

const bridge: CaptureBridge = {
  onStart: (handler) => {
    ipcRenderer.on(CAPTURE.start, (_event, message: CaptureStartMessage) => handler(message))
  },
  onStop: (handler) => {
    ipcRenderer.on(CAPTURE.stop, () => handler())
  },
  onPause: (handler) => {
    ipcRenderer.on(CAPTURE.pause, () => handler())
  },
  onResume: (handler) => {
    ipcRenderer.on(CAPTURE.resume, () => handler())
  },
  sendChunk: (chunk) => ipcRenderer.invoke(CAPTURE.chunk, chunk),
  started: (message) => ipcRenderer.invoke(CAPTURE.started, message),
  finalized: (key) => ipcRenderer.invoke(CAPTURE.finalized, key),
  error: (message) => ipcRenderer.invoke(CAPTURE.error, message),
  warning: (message) => ipcRenderer.invoke(CAPTURE.warning, message)
}

contextBridge.exposeInMainWorld('polishCapture', bridge)
