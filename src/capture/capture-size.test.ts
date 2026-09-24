import { describe, expect, it } from 'vitest'
import { CAPTURE_SIZE_CHANGE_BEHAVIOR, MIN_CAPTURE_EDGE, captureCropRect, captureSizeError, displayVideoConstraints, MAX_CAPTURE_WIDTH, MAX_CAPTURE_HEIGHT } from './capture-size'

it('preserves aspect ratio when the window changes dimensions', () => {
  expect(CAPTURE_SIZE_CHANGE_BEHAVIOR).toBe('contain')
})

it('does not stretch a clipped region to fill the original crop', () => {
  expect(captureCropRect({ x: 100, y: 100, width: 1000, height: 800 }, { width: 800, height: 600 }))
    .toEqual({ x: 100, y: 100, width: 700, height: 500, destinationX: 0, destinationY: 0 })
})

it('keeps the destination offset when the region extends left or above the source', () => {
  expect(captureCropRect({ x: -20, y: -10, width: 100, height: 80 }, { width: 800, height: 600 }))
    .toEqual({ x: 0, y: 0, width: 80, height: 70, destinationX: 20, destinationY: 10 })
})

it('does not repeat the last source pixel when the crop falls outside a resized window', () => {
  const rect = captureCropRect({ x: 900, y: 700, width: 100, height: 100 }, { width: 800, height: 600 })
  expect(rect.width).toBe(0)
  expect(rect.height).toBe(0)
})

describe('captureSizeError', () => {
  it('rejects the tiny PipeWire placeholder stream seen on Hyprland', () => {
    expect(captureSizeError(2, 2)).toContain('2\u00d72')
  })

  it('rejects invalid dimensions', () => {
    expect(captureSizeError(0, 1080)).not.toBeNull()
    expect(captureSizeError(Number.NaN, 1080)).not.toBeNull()
  })

  it('accepts real screen, window and region sizes', () => {
    expect(captureSizeError(MIN_CAPTURE_EDGE, MIN_CAPTURE_EDGE)).toBeNull()
    expect(captureSizeError(708, 1026)).toBeNull()
    expect(captureSizeError(3440, 1440)).toBeNull()
  })
})

describe('display capture constraints', () => {
  it('asks for full source resolution as a ceiling, never a target, at the chosen frame rate', () => {
    const c = displayVideoConstraints(60)
    expect(c.frameRate).toEqual({ ideal: 60, max: 60 })
    // Only maxima: an ideal or exact size would make Chromium scale small windows up.
    expect(c.width).toEqual({ max: 7680 })
    expect(c.height).toEqual({ max: 4320 })
    // Big enough for a 5K2K ultrawide at 1x and a 4K monitor at 2x.
    expect(MAX_CAPTURE_WIDTH).toBeGreaterThanOrEqual(5120)
    expect(MAX_CAPTURE_HEIGHT).toBeGreaterThanOrEqual(2160)
  })
})
