// Receives export bytes from the editor and writes them under
// <recording>/exports/. GIF exports land in a temp MP4 first, then ffmpeg
// (two-pass palette) produces the .gif and the temp file is removed.

import { execFile } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import type { ExportBeginRequest, ExportBeginResponse, ExportEndRequest, ExportEndResponse } from '@shared/ipc'
import { ffmpegGifArgs } from './gif'
import { audioMixFilter } from './audio-filter'
import { sanitizeBaseName, stemOf, uniqueName } from './naming'

export interface ExportSinkDeps {
  /** Recordings root; export folders must live under it. */
  root: () => string
  ffmpegPath: () => string
  /** fraction 0..1, or null when the export ended or was aborted. */
  onProgress?: (exportId: string, fraction: number | null) => void
}

export interface ExportSink {
  begin(request: ExportBeginRequest): Promise<ExportBeginResponse>
  chunk(exportId: string, position: number, data: ArrayBuffer | ArrayBufferView): void
  end(request: ExportEndRequest): Promise<ExportEndResponse>
  abort(exportId: string): Promise<void>
  progress(exportId: string, fraction: number): void
}

interface Job {
  id: string
  kind: 'mp4' | 'gif'
  fd: number | null
  /** File currently being written (the MP4, or the temp MP4 for GIF). */
  writePath: string
  finalPath: string
}

let counter = 0

export function assertInsideRoot(root: string, folder: string): string {
  const rootAbs = path.resolve(root)
  const abs = path.resolve(folder)
  if (!abs.startsWith(rootAbs + path.sep)) throw new Error(`Folder is outside the recordings root: ${folder}`)
  return abs
}

function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) return resolve()
      const tail = String(stderr ?? '').trim().split(/\r?\n/).slice(-6).join('\n')
      reject(new Error(`ffmpeg failed: ${error.message}${tail ? `\n${tail}` : ''}`))
    })
  })
}

export function createExportSink(deps: ExportSinkDeps): ExportSink {
  const jobs = new Map<string, Job>()

  const take = (id: string): Job => {
    const job = jobs.get(id)
    if (!job) throw new Error(`Unknown export ${id}`)
    return job
  }

  const closeFd = (job: Job): void => {
    if (job.fd === null) return
    try {
      fs.closeSync(job.fd)
    } catch (err) {
      console.warn('[export] close failed', err)
    }
    job.fd = null
  }

  return {
    async begin(request) {
      const folder = assertInsideRoot(deps.root(), request.folder)
      const exportsDir = path.join(folder, 'exports')
      await fs.promises.mkdir(exportsDir, { recursive: true })
      const existing = await fs.promises.readdir(exportsDir)
      const base = sanitizeBaseName(request.name)
      const id = `exp-${Date.now()}-${++counter}`
      const finalName = uniqueName(existing, base, request.kind)
      const finalPath = path.join(exportsDir, finalName)
      const writePath = request.kind === 'gif' ? path.join(exportsDir, `${stemOf(finalName)}.${id}.tmp.mp4`) : finalPath
      const fd = fs.openSync(writePath, 'w+')
      jobs.set(id, { id, kind: request.kind, fd, writePath, finalPath })
      deps.onProgress?.(id, 0)
      return { exportId: id, path: writePath }
    },

    chunk(exportId, position, data) {
      const job = take(exportId)
      if (job.fd === null) throw new Error(`Export ${exportId} is already closed`)
      const buf = ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data)
      let offset = 0
      while (offset < buf.length) {
        offset += fs.writeSync(job.fd, buf, offset, buf.length - offset, position + offset)
      }
    },

    async end(request) {
      const job = take(request.exportId)
      closeFd(job)
      try {
        const count = request.audioTrackCount ?? 0
        if (job.kind === 'mp4' && Number.isInteger(count) && count >= 1 && count <= 32) {
          const mixed = `${job.writePath}.${job.id}.mixed.mp4`
          await runFfmpeg(deps.ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-i', job.writePath, '-filter_complex', audioMixFilter(count, request.audioSpeedSpans), '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', mixed])
          await fs.promises.rename(mixed, job.writePath)
        }
        if (job.kind === 'gif') {
          await runFfmpeg(deps.ffmpegPath(), ffmpegGifArgs(job.writePath, job.finalPath, request.fps, request.width))
          await fs.promises.rm(job.writePath, { force: true })
        }
      } finally {
        jobs.delete(job.id)
        deps.onProgress?.(job.id, null)
      }
      return { path: job.finalPath }
    },

    async abort(exportId) {
      const job = jobs.get(exportId)
      if (!job) return
      closeFd(job)
      jobs.delete(job.id)
      deps.onProgress?.(job.id, null)
      await fs.promises.rm(job.writePath, { force: true })
      if (job.finalPath !== job.writePath) await fs.promises.rm(job.finalPath, { force: true })
    },

    progress(exportId, fraction) {
      if (!jobs.has(exportId)) return
      const f = Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0
      deps.onProgress?.(exportId, f)
    }
  }
}
