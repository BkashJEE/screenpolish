// Nudges the real mouse during the self test so the input log has movement to
// record. Windows only; on any other platform mouse_event is unavailable and
// the wiggler is inert, which the self test tolerates.

import koffi from 'koffi'

const MOUSEEVENTF_MOVE = 0x0001

/** Starts wiggling and returns the stopper. */
export function mouseWiggler(): () => void {
  let mouseEvent: ((...args: unknown[]) => void) | null = null
  try {
    mouseEvent = koffi.load('user32.dll').func('void __stdcall mouse_event(uint32 flags, int32 dx, int32 dy, uint32 data, uintptr extra)')
  } catch (err) {
    console.warn('[selftest] mouse_event unavailable', err)
  }
  let step = 0
  const timer = setInterval(() => {
    step++
    const d = step % 40 < 20 ? 6 : -6
    mouseEvent?.(MOUSEEVENTF_MOVE, d, d, 0, 0)
  }, 30)
  return () => clearInterval(timer)
}
