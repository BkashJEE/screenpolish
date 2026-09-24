// Exports driven from main (the CLI). WebCodecs lives in the renderer, so
// main opens the editor on the folder, hands it an ExportRequest, and waits
// for the editor to report back. Requests registered before the editor has
// mounted are pulled by the editor on mount (pendingExport); requests made
// while it is already open are pushed (exportRequest). Either way the editor
// dedupes by requestId.

import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import { EDITOR, type ExportKind, type ExportRequest, type ExportRequestResult } from '@shared/ipc'
import { openEditor } from './windows'

interface Pending {
  request: ExportRequest
  taken: boolean
  resolve: (path: string) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const pending = new Map<string, Pending>()

export const EXPORT_TIMEOUT_MS = 15 * 60 * 1000

export function requestExport(folder: string, kind: ExportKind, name: string, timeoutMs = EXPORT_TIMEOUT_MS): Promise<string> {
  const request: ExportRequest = { requestId: randomUUID(), folder, kind, name }
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(request.requestId)
      reject(new Error(`Export did not finish within ${Math.round(timeoutMs / 1000)} s`))
    }, timeoutMs)
    pending.set(request.requestId, { request, taken: false, resolve, reject, timer })

    const win = openEditor(folder)
    const push = (): void => {
      const p = pending.get(request.requestId)
      if (!p || p.taken || win.isDestroyed()) return
      win.webContents.send(EDITOR.exportRequest, request)
    }
    // A fresh window pulls on mount; an already-open editor only learns about
    // the request through the push. Send it either way, a little after load.
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(push, 1500))
    else setTimeout(push, 400)
  })
}

export function takePendingExport(folder: string): ExportRequest | null {
  for (const p of pending.values()) {
    if (p.request.folder === folder && !p.taken) {
      p.taken = true
      return p.request
    }
  }
  return null
}

export function completeExport(result: ExportRequestResult): void {
  const p = pending.get(result.requestId)
  if (!p) return
  clearTimeout(p.timer)
  pending.delete(result.requestId)
  if (result.path) p.resolve(result.path)
  else p.reject(new Error(result.error ?? 'Export failed'))
}

export function registerExportRequestIpc(): void {
  ipcMain.handle(EDITOR.pendingExport, (_e, folder: string) => takePendingExport(folder))
  ipcMain.on(EDITOR.exportRequestDone, (_e, result: ExportRequestResult) => completeExport(result))
}
