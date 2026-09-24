// Pure helpers behind the polish:// media protocol. No Electron imports so
// vitest can cover them in a plain node environment.

import * as path from 'node:path'

export type ParsedRange =
  | { type: 'full' }
  | { type: 'range'; start: number; end: number }
  | { type: 'unsatisfiable' }

/**
 * Parse an HTTP Range header against a resource of `size` bytes.
 * Only single byte ranges are honoured; anything else falls back to the full
 * resource, matching what browsers expect from a lenient server.
 */
export function parseRange(header: string | null | undefined, size: number): ParsedRange {
  if (!header) return { type: 'full' }
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header)
  if (!m) return { type: 'full' }
  const [, first, last] = m
  if (first === '' && last === '') return { type: 'full' }
  if (size <= 0) return { type: 'unsatisfiable' }

  let start: number
  let end: number
  if (first === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(last)
    if (suffix === 0) return { type: 'unsatisfiable' }
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(first)
    end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { type: 'full' }
  if (start >= size || start > end) return { type: 'unsatisfiable' }
  return { type: 'range', start, end }
}

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.js': 'text/javascript',
  '.tflite': 'application/octet-stream',
  '.woff2': 'font/woff2'
}

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

export function encodeFolderName(name: string): string {
  return Buffer.from(name, 'utf8').toString('base64url')
}

export function decodeFolderName(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf8')
}

/** `polish://media/<base64url folder name>/<file>`. `folder` may be absolute; only its basename is used. */
export function mediaUrl(folder: string, file: string): string {
  const name = path.basename(folder)
  const segments = file.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent)
  return `polish://media/${encodeFolderName(name)}/${segments.join('/')}`
}

/** `polish://image/<base64url absolute path>` for a user-picked background image (allowlisted in main). */
export function imageUrl(absolutePath: string): string {
  return `polish://image/${Buffer.from(absolutePath, 'utf8').toString('base64url')}`
}

const isSafeSegment = (s: string): boolean => s.length > 0 && s !== '.' && s !== '..' && !/[\\/\0]/.test(s)

/**
 * Resolve a polish://media URL to an absolute path under `root`, or null when
 * the URL is malformed or would escape the recordings root.
 */
export function resolveMediaPath(root: string, url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'polish:' || parsed.host !== 'media') return null
  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return ''
      }
    })
  if (segments.length < 2) return null
  const folder = decodeFolderName(segments[0])
  const files = segments.slice(1)
  if (!isSafeSegment(folder) || !files.every(isSafeSegment)) return null
  const rootAbs = path.resolve(root)
  const abs = path.resolve(rootAbs, folder, ...files)
  if (!abs.startsWith(rootAbs + path.sep)) return null
  return abs
}

/** Decode a polish://image URL back to the absolute path it encodes (not yet allowlist-checked). */
export function resolveImagePath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'polish:' || parsed.host !== 'image') return null
  const encoded = parsed.pathname.split('/').filter(Boolean)[0]
  if (!encoded) return null
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
  return decoded.length > 0 ? path.resolve(decoded) : null
}
