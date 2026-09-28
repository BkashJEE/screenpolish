// Hides the OS cursor from screen capture by swapping all 13 system cursors for
// a blank 32×32 one (SetSystemCursor) and restores them with
// SystemParametersInfoW(SPI_SETCURSORS). Same FFI signatures as spike/main.js.
// A marker file in userData lets the next launch recover after a crash.

import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import koffi from 'koffi'

/** OCR_* ids: normal, ibeam, wait, cross, up, size nwse/nesw/we/ns/all, no, hand, appstarting. */
const CURSOR_IDS = [32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650]
const SPI_SETCURSORS = 0x0057
const MARKER_FILE = 'cursor-hidden.marker'

interface User32 {
  CreateCursor: (...args: unknown[]) => unknown
  SetSystemCursor: (...args: unknown[]) => boolean
  SystemParametersInfoW: (...args: unknown[]) => boolean
}

let user32: User32 | null = null
let hidden = false

function native(): User32 {
  if (user32) return user32
  const lib = koffi.load('user32.dll')
  user32 = {
    CreateCursor: lib.func(
      'void* __stdcall CreateCursor(void* hInst, int xHotSpot, int yHotSpot, int nWidth, int nHeight, const void* pvANDPlane, const void* pvXORPlane)'
    ),
    SetSystemCursor: lib.func('bool __stdcall SetSystemCursor(void* hcur, uint32 id)'),
    SystemParametersInfoW: lib.func(
      'bool __stdcall SystemParametersInfoW(uint32 uiAction, uint32 uiParam, void* pvParam, uint32 fWinIni)'
    )
  }
  return user32
}

export function markerPath(): string {
  return path.join(app.getPath('userData'), MARKER_FILE)
}

function markerExists(): boolean {
  try {
    return fs.existsSync(markerPath())
  } catch {
    return false
  }
}

function writeMarker(): void {
  try {
    fs.mkdirSync(path.dirname(markerPath()), { recursive: true })
    fs.writeFileSync(markerPath(), String(Date.now()))
  } catch (err) {
    console.warn('[cursor] could not write marker', err)
  }
}

function removeMarker(): void {
  try {
    fs.rmSync(markerPath(), { force: true })
  } catch (err) {
    console.warn('[cursor] could not remove marker', err)
  }
}

function restoreNative(): void {
  if (process.platform !== 'win32') return
  native().SystemParametersInfoW(SPI_SETCURSORS, 0, null, 0)
}

export function isCursorHidden(): boolean {
  return hidden
}

/** Idempotent. Writes the marker before touching cursors so a crash mid-way is still recoverable. */
export function hideSystemCursor(): void {
  if (hidden || process.platform !== 'win32') return
  const u = native()
  writeMarker()
  const andPlane = Buffer.alloc(128, 0xff)
  const xorPlane = Buffer.alloc(128, 0x00)
  for (const id of CURSOR_IDS) {
    // SetSystemCursor takes ownership of the handle, so one fresh cursor per id.
    const handle = u.CreateCursor(null, 0, 0, 32, 32, andPlane, xorPlane)
    if (!handle || !u.SetSystemCursor(handle, id)) console.warn(`[cursor] SetSystemCursor failed for ${id}`)
  }
  hidden = true
}

/** Idempotent. Restores when we hid the cursor in this process or a marker from a crashed run exists. */
export function restoreSystemCursor(): void {
  if (!hidden && !markerExists()) return
  try {
    restoreNative()
  } catch (err) {
    console.error('[cursor] restore failed', err)
  }
  hidden = false
  removeMarker()
}

/** Crash recovery at launch. Returns true if a stale marker was found and cursors were restored. */
export function recoverCursorsIfNeeded(): boolean {
  if (!markerExists()) return false
  console.warn('[cursor] marker found from a previous run; restoring system cursors')
  restoreSystemCursor()
  return true
}

process.on('exit', () => {
  if (!hidden) return
  try {
    restoreNative()
    removeMarker()
  } catch {
    /* nothing left to do at exit */
  }
})
