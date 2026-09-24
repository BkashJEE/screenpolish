/**
 * Window previews for the record panel on Hyprland.
 *
 * The share portal only shows its picker after Record is pressed, so the
 * panel cannot use it to show what a window contains. grim can capture one
 * window directly through the foreign-toplevel protocol (`grim -T`), using the
 * `stableId` Hyprland reports for each client. That works for windows on other
 * workspaces too, and never involves the portal. Previews are best effort:
 * without grim, or for a window that closes mid-listing, the row simply has no
 * picture.
 */

import { execFile } from 'node:child_process'

/** Preview width in pixels; the panel shows them at about a third of that. */
export const PREVIEW_WIDTH = 320
const PREVIEW_TIMEOUT_MS = 2500
const MAX_PREVIEW_BYTES = 2_000_000

export interface PreviewClient {
  stableId?: string
  size: [number, number]
  class?: string
  initialClass?: string
  workspace: { id: number; name?: string }
}

/** grim's -s scales logical pixels; pick the factor that yields PREVIEW_WIDTH, never enlarging. */
export function previewScale(logicalWidth: number, target = PREVIEW_WIDTH): number {
  if (!Number.isFinite(logicalWidth) || logicalWidth <= 0) return 0.25
  return Math.max(0.05, Math.min(1, Math.round((target / logicalWidth) * 1000) / 1000))
}

/** A stableId is short hex from Hyprland; anything else never reaches the command line. */
export function isStableId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{1,16}$/i.test(id)
}

export function previewArgs(client: PreviewClient, width = PREVIEW_WIDTH): string[] | null {
  if (!isStableId(client.stableId)) return null
  return ['-T', client.stableId, '-s', String(previewScale(client.size[0], width)), '-t', 'jpeg', '-q', '70', '-']
}

/** Width of the capture used to fingerprint a window; the grid is 32 wide, so this is plenty. */
export const FINGERPRINT_CAPTURE_WIDTH = 128
/**
 * Some windows never hand grim a frame (Electron apps that are not drawing),
 * and grim then waits. This check holds up pointer logging at the start of a
 * take, so give up quickly; a successful capture takes well under 200 ms.
 */
export const FINGERPRINT_CAPTURE_TIMEOUT_MS = 1200

/** "Chromium · Workspace 4": what app it is and where, to tell same-titled windows apart. */
export function windowDetail(client: PreviewClient): string {
  const raw = client.class || client.initialClass || ''
  // Web apps report classes like "chrome-x.com__-Profile_1".
  const web = /^(?:chrome|brave|msedge)-([^_]+)__/.exec(raw)
  const app = web ? web[1] : raw.split('.').pop() || ''
  const pretty = app ? app.charAt(0).toUpperCase() + app.slice(1) : ''
  const name = client.workspace.name ?? String(client.workspace.id)
  const where = client.workspace.id < 0 || name.startsWith('special') ? 'Scratchpad' : `Workspace ${name}`
  return pretty ? `${pretty} · ${where}` : where
}

export type Runner = (file: string, args: string[], timeoutMs?: number) => Promise<Buffer>

const runGrim: Runner = (file, args, timeoutMs = PREVIEW_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    execFile(file, args, { encoding: 'buffer', timeout: timeoutMs, maxBuffer: MAX_PREVIEW_BYTES }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })

/** The window as JPEG bytes, or undefined when it cannot be captured. */
export async function windowJpeg(client: PreviewClient, width = PREVIEW_WIDTH, run: Runner = runGrim, timeoutMs = PREVIEW_TIMEOUT_MS): Promise<Buffer | undefined> {
  const args = previewArgs(client, width)
  if (!args) return undefined
  try {
    const jpeg = await run('grim', args, timeoutMs)
    // JPEG files start with FF D8; anything else is an error message or nothing.
    return jpeg.length >= 4 && jpeg[0] === 0xff && jpeg[1] === 0xd8 ? jpeg : undefined
  } catch {
    return undefined
  }
}

/** JPEG data URL of the window, or undefined when it cannot be captured. */
export async function windowPreview(client: PreviewClient, run: Runner = runGrim): Promise<string | undefined> {
  const jpeg = await windowJpeg(client, PREVIEW_WIDTH, run)
  return jpeg ? `data:image/jpeg;base64,${jpeg.toString('base64')}` : undefined
}
