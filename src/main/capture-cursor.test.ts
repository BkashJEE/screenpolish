import { describe, expect, it } from 'vitest'
import { canShowCaptureExcludedOverlays, cursorBakedForPlayback, cursorBakedIntoCapture } from './capture-cursor'

describe('cursorBakedIntoCapture', () => {
  it('respects reported cursor inclusion on Linux rather than drawing a duplicate', () => {
    for (const mode of ['always', 'motion'] as const) {
      expect(cursorBakedIntoCapture('linux', false, mode)).toBe(true)
      expect(cursorBakedForPlayback('linux', false, mode)).toBe(true)
    }
    expect(cursorBakedIntoCapture('linux', false, 'never')).toBe(false)
    expect(cursorBakedForPlayback('linux', true, 'never')).toBe(false)
  })
  it('redraws the tracked pointer for Hyprland portal captures', () => {
    expect(cursorBakedIntoCapture('linux', false)).toBe(false)
  })

  it('treats a visible native pointer as baked on other platforms', () => {
    expect(cursorBakedIntoCapture('darwin', false)).toBe(true)
    expect(cursorBakedIntoCapture('win32', false)).toBe(true)
  })

  it('redraws a pointer that ScreenPolish hid on Windows', () => {
    expect(cursorBakedIntoCapture('win32', true)).toBe(false)
  })

  it('repairs the stale baked flag when an older Linux recording is loaded', () => {
    expect(cursorBakedForPlayback('linux', true)).toBe(false)
    expect(cursorBakedForPlayback('win32', true)).toBe(true)
  })

  it('does not place content-protected helper windows over PipeWire captures', () => {
    expect(canShowCaptureExcludedOverlays('linux')).toBe(false)
    expect(canShowCaptureExcludedOverlays('win32')).toBe(true)
    expect(canShowCaptureExcludedOverlays('darwin')).toBe(true)
  })
})
