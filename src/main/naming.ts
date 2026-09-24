// Pure naming helpers: recording folder names and unique export file names.

const pad = (n: number): string => String(n).padStart(2, '0')

/** `yyyy-MM-dd_HH-mm-ss` in local time, sortable and Windows-safe. */
export function formatFolderName(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  )
}

const FOLDER_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/

/** Inverse of formatFolderName. Returns unix ms (local time) or null if the name does not match. */
export function parseFolderName(name: string): number | null {
  const m = FOLDER_RE.exec(name)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const date = new Date(y, mo - 1, d, h, mi, s)
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date.getTime()
}

export function isRecordingFolderName(name: string): boolean {
  return parseFolderName(name) !== null
}

/** Strip characters Windows refuses in file names; never returns an empty string. */
export function sanitizeBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  return cleaned.length > 0 ? cleaned : 'export'
}

/**
 * First of `base.ext`, `base (2).ext`, `base (3).ext`… that is not in
 * `existing` (case-insensitive, like NTFS).
 */
export function uniqueName(existing: Iterable<string>, base: string, ext: string): string {
  const taken = new Set<string>()
  for (const e of existing) taken.add(e.toLowerCase())
  let candidate = `${base}.${ext}`
  let n = 2
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${n}).${ext}`
    n++
  }
  return candidate
}

/** Strip the extension from a unique file name so a sibling temp file can share its stem. */
export function stemOf(fileName: string): string {
  const i = fileName.lastIndexOf('.')
  return i > 0 ? fileName.slice(0, i) : fileName
}
