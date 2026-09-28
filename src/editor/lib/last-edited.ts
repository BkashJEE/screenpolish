/**
 * The recording the Edit tab returns to.
 *
 * The rail's Edit tab did nothing: it was enabled only while the editor was
 * already open, and its click handler was empty, so the only way in was the
 * library. It now reopens the last recording that was edited, remembered
 * across restarts, and stays disabled until there is one.
 */
const KEY = 'polish.lastEdited'

/** A recording folder name, never a path: the app only opens names under the recordings root. */
export function isFolderName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('/') && !value.includes('\\') && value !== '.' && value !== '..'
}

export function readLastEdited(): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    return isFolderName(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeLastEdited(folder: string | null): void {
  try {
    if (folder && isFolderName(folder)) localStorage.setItem(KEY, folder)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage is optional */
  }
}
