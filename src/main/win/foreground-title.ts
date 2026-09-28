// Title of the foreground window, used to auto-name recordings. Windows only;
// anything failing here just yields null and the recording keeps its
// timestamp name.

import koffi from 'koffi'

let fns: null | {
  GetForegroundWindow: () => unknown
  GetWindowTextW: (hwnd: unknown, buf: Buffer, max: number) => number
} = null

function load(): typeof fns {
  if (fns) return fns
  try {
    const user32 = koffi.load('user32.dll')
    fns = {
      GetForegroundWindow: user32.func('void* __stdcall GetForegroundWindow()') as () => unknown,
      GetWindowTextW: user32.func('int __stdcall GetWindowTextW(void* hwnd, _Out_ void* buf, int max)') as (
        hwnd: unknown,
        buf: Buffer,
        max: number
      ) => number
    }
  } catch (err) {
    console.warn('[foreground] user32 unavailable', err)
  }
  return fns
}

export function foregroundWindowTitle(): string | null {
  if (process.platform !== 'win32') return null
  const f = load()
  if (!f) return null
  try {
    const hwnd = f.GetForegroundWindow()
    if (!hwnd) return null
    const buf = Buffer.alloc(512 * 2)
    const n = f.GetWindowTextW(hwnd, buf, 512)
    if (n <= 0) return null
    return buf.toString('utf16le', 0, n * 2)
  } catch {
    return null
  }
}
