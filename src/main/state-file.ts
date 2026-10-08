/**
 * The recording state on disk, for anything that wants to watch it without
 * asking the app.
 *
 * Every `screenpolish status` is a full Electron start: a bar widget polling
 * it every four seconds launched the app's runtime 15 times a minute, all day.
 * This file holds the same answer `status` prints, so a watcher can read it
 * with `cat`. It names the app's pid, so a watcher can tell a file left by a
 * crash from a live one, and it is removed when the app quits.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import type { RecordingState } from '@shared/ipc'

export const STATE_FILE = 'state.json'

/** The line written: the same shape `screenpolish status` prints, plus the pid. */
export function stateFileBody(state: RecordingState, pid: number, lastFolder: string | null): string {
  return `${JSON.stringify({ ok: true, pid, state, lastFolder })}\n`
}

export interface StateFileFs {
  mkdirSync: (dir: string, options: { recursive: true }) => void
  writeFileSync: (file: string, text: string) => void
  renameSync: (from: string, to: string) => void
  rmSync: (file: string, options: { force: true }) => void
}

/** Replaces the file in one step, so a reader never sees half of it. */
export function writeStateFile(
  dir: string,
  state: RecordingState,
  pid: number,
  lastFolder: string | null,
  fsys: StateFileFs = fs as unknown as StateFileFs
): void {
  const file = path.join(dir, STATE_FILE)
  const tmp = `${file}.${pid}.tmp`
  try {
    fsys.mkdirSync(dir, { recursive: true })
    fsys.writeFileSync(tmp, stateFileBody(state, pid, lastFolder))
    fsys.renameSync(tmp, file)
  } catch (err) {
    console.warn('[state-file] could not write', err)
  }
}

export function removeStateFile(dir: string, fsys: StateFileFs = fs as unknown as StateFileFs): void {
  try {
    fsys.rmSync(path.join(dir, STATE_FILE), { force: true })
  } catch {
    // Already gone, or unwritable: a watcher checks the pid anyway.
  }
}
