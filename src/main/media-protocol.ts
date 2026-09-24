// polish:// protocol. Serves recording files from the recordings root only,
// with full HTTP Range support so <video> can seek and mediabunny can fetch.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { Readable } from 'node:stream'
import { app, protocol } from 'electron'
import { contentTypeFor, parseRange, resolveImagePath, resolveMediaPath } from './media-range'
import { getRecordingsRoot } from './settings'

export { mediaUrl, imageUrl, parseRange } from './media-range'

export const SCHEME = 'polish'

/** Current recordings root (user-chosen in settings, default Videos/ScreenPolish). */
export function recordingsRoot(): string {
  return getRecordingsRoot()
}

/** Must run before app.whenReady(). */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
  ])
}

/** Absolute image paths the renderer may load through polish://image/… (user-picked backgrounds). */
const allowedImages = new Set<string>()

export function allowImage(absolutePath: string): void {
  allowedImages.add(path.resolve(absolutePath))
}

async function serveFile(request: Request, filePath: string): Promise<Response> {
  let stat: fs.Stats
  try {
    stat = await fs.promises.stat(filePath)
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!stat.isFile()) return new Response('Not found', { status: 404 })

  const headers = new Headers({
    'Content-Type': contentTypeFor(filePath),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    // The editor runs on http://localhost in dev and file:// when packaged;
    // both are cross-origin to polish://, and mediabunny fetches with Range.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
  })
  const range = parseRange(request.headers.get('range'), stat.size)
  if (range.type === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${stat.size}`)
    return new Response(null, { status: 416, headers })
  }

  const start = range.type === 'range' ? range.start : 0
  const end = range.type === 'range' ? range.end : stat.size - 1
  const length = stat.size === 0 ? 0 : end - start + 1
  headers.set('Content-Length', String(length))
  if (range.type === 'range') headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`)
  const status = range.type === 'range' ? 206 : 200

  if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers })
  const nodeStream = fs.createReadStream(filePath, { start, end })
  const body = Readable.toWeb(nodeStream) as unknown as ReadableStream
  return new Response(body, { status, headers })
}

/** polish://asset/<relative path under resources/> — bundled backgrounds, fonts, brand marks. Read-only, no traversal. */
export function resolveBundledAsset(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${SCHEME}:` || parsed.hostname !== 'asset') return null
  const rel = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  if (!rel || rel.includes('..') || rel.includes('\\')) return null
  const root = path.join(app.getAppPath(), 'resources')
  const full = path.resolve(root, rel)
  if (!full.startsWith(path.resolve(root) + path.sep)) return null
  return full
}

export function assetUrl(relative: string): string {
  return `${SCHEME}://asset/${relative.split(path.sep).join('/')}`
}

/** Call after app ready. */
export function registerMediaProtocol(): void {
  protocol.handle(SCHEME, (request) => {
    // Resolved per request so a folder change in settings applies without a restart.
    const root = recordingsRoot()
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      })
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 })
    }
    const mediaPath = resolveMediaPath(root, request.url)
    if (mediaPath) return serveFile(request, mediaPath)
    const imagePath = resolveImagePath(request.url)
    if (imagePath && allowedImages.has(imagePath)) return serveFile(request, imagePath)
    const asset = resolveBundledAsset(request.url)
    if (asset) return serveFile(request, asset)
    return new Response('Not found', { status: 404 })
  })
}
