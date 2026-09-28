// Physical-pixel window bounds on Windows, through user32 and dwmapi.
// Windows only: everywhere else `windowRegion` returns null and the caller
// falls back to the display region (Linux gets its window rectangles from the
// compositor, see ../linux/capture-target.ts).

import { screen } from 'electron'
import koffi from 'koffi'
import type { CaptureRegion } from '@shared/types'
import { displayContaining, regionFromPhysicalRect } from '../region-math'

interface WinRectApi {
  GetWindowRect: (...args: unknown[]) => boolean
  DwmGetWindowAttribute: ((...args: unknown[]) => number) | null
}

let winRectApi: WinRectApi | null = null
const DWMWA_EXTENDED_FRAME_BOUNDS = 9

function rectApi(): WinRectApi {
  if (winRectApi) return winRectApi
  koffi.struct('POLISH_RECT', { left: 'int', top: 'int', right: 'int', bottom: 'int' })
  const user32 = koffi.load('user32.dll')
  let dwm: ((...args: unknown[]) => number) | null = null
  try {
    dwm = koffi
      .load('dwmapi.dll')
      .func('int __stdcall DwmGetWindowAttribute(intptr hwnd, uint32 attr, _Out_ POLISH_RECT* out, uint32 size)')
  } catch {
    dwm = null
  }
  winRectApi = {
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr hwnd, _Out_ POLISH_RECT* out)'),
    DwmGetWindowAttribute: dwm
  }
  return winRectApi
}

/** Parse the HWND out of a desktopCapturer window id (`window:<hwnd>:<n>` on Windows). */
export function hwndFromSourceId(sourceId: string): number | null {
  const m = /^window:(\d+):/.exec(sourceId)
  if (!m) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * Physical-pixel bounds of a window (DWM extended frame bounds, falling back
 * to GetWindowRect), or null if unavailable. Scale comes from the display
 * under the window's centre.
 */
export function windowRegion(sourceId: string): CaptureRegion | null {
  if (process.platform !== 'win32') return null
  const hwnd = hwndFromSourceId(sourceId)
  if (hwnd === null) return null
  try {
    const api = rectApi()
    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    let ok = false
    if (api.DwmGetWindowAttribute) ok = api.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) === 0
    if (!ok) ok = api.GetWindowRect(hwnd, rect)
    if (!ok) return null
    const width = rect.right - rect.left
    const height = rect.bottom - rect.top
    if (width <= 0 || height <= 0) return null
    const display = displayContaining(screen.getAllDisplays(), rect.left + width / 2, rect.top + height / 2)
    const scale = display?.scaleFactor ?? screen.getPrimaryDisplay().scaleFactor
    return regionFromPhysicalRect({ x: rect.left, y: rect.top, width, height }, scale)
  } catch (err) {
    console.warn('[sources] windowRegion failed', err)
    return null
  }
}

