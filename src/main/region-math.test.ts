import { describe, expect, it } from 'vitest'
import {
  MAX_VIDEO_BITRATE,
  MIN_VIDEO_BITRATE,
  bitrateFor,
  cropForRegion,
  displayContaining,
  evenSize,
  regionForDisplay,
  regionFromOverlayRect
} from './region-math'

const primary = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }
const hidpi = { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 720 }, scaleFactor: 2 }
const oddScale = { id: 3, bounds: { x: 0, y: 1080, width: 1707, height: 960 }, scaleFactor: 1.5 }

describe('evenSize', () => {
  it('rounds down to even and floors at 2', () => {
    expect(evenSize(1919)).toBe(1918)
    expect(evenSize(1920)).toBe(1920)
    expect(evenSize(1)).toBe(2)
    expect(evenSize(0)).toBe(2)
    expect(evenSize(1919.6)).toBe(1920)
  })
})

describe('regionForDisplay', () => {
  it('is identity at scale 1', () => {
    expect(regionForDisplay(primary)).toEqual({ x: 0, y: 0, width: 1920, height: 1080, scale: 1 })
  })
  it('multiplies DIP bounds by the scale factor', () => {
    expect(regionForDisplay(hidpi)).toEqual({ x: 3840, y: 0, width: 2560, height: 1440, scale: 2 })
  })
  it('rounds fractional scales to even physical sizes', () => {
    const r = regionForDisplay(oddScale)
    expect(r).toEqual({ x: 0, y: 1620, width: 2560, height: 1440, scale: 1.5 })
  })
  it('treats a zero scale factor as 1', () => {
    expect(regionForDisplay({ bounds: primary.bounds, scaleFactor: 0 }).scale).toBe(1)
  })
})

describe('regionFromOverlayRect', () => {
  it('offsets by the display origin and scales', () => {
    const r = regionFromOverlayRect(hidpi, { x: 100, y: 50, width: 400, height: 300 })
    expect(r).toEqual({ x: 4040, y: 100, width: 800, height: 600, scale: 2 })
  })
  it('never produces odd dimensions', () => {
    const r = regionFromOverlayRect(oddScale, { x: 1, y: 1, width: 101, height: 33 })
    expect(r.width % 2).toBe(0)
    expect(r.height % 2).toBe(0)
  })
})

describe('cropForRegion', () => {
  const display = regionForDisplay(hidpi)
  it('is region minus display origin', () => {
    const region = { x: 4040, y: 100, width: 800, height: 600, scale: 2 }
    expect(cropForRegion(region, display)).toEqual({ x: 200, y: 100, width: 800, height: 600 })
  })
  it('clamps a region hanging off the display edge', () => {
    const region = { x: 3840 + 2000, y: 0, width: 1000, height: 1440, scale: 2 }
    const c = cropForRegion(region, display)
    expect(c.x).toBe(2000)
    expect(c.width).toBe(560)
    expect(c.x + c.width).toBeLessThanOrEqual(display.width)
  })
  it('clamps a region starting before the display', () => {
    const region = { x: 3800, y: -20, width: 100, height: 100, scale: 2 }
    expect(cropForRegion(region, display)).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })
})

describe('displayContaining', () => {
  const displays = [primary, hidpi, oddScale]
  it('finds the display by physical point', () => {
    expect(displayContaining(displays, 10, 10)?.id).toBe(1)
    expect(displayContaining(displays, 4000, 10)?.id).toBe(2)
    expect(displayContaining(displays, 10, 1700)?.id).toBe(3)
  })
  it('returns null off every display', () => {
    expect(displayContaining(displays, -5, -5)).toBeNull()
    expect(displayContaining(displays, 99999, 0)).toBeNull()
  })
})

describe('bitrateFor', () => {
  it('scales with area and fps within bounds', () => {
    const b1080 = bitrateFor(1920, 1080, 30)
    expect(b1080).toBeGreaterThan(MIN_VIDEO_BITRATE)
    expect(b1080).toBeLessThan(MAX_VIDEO_BITRATE)
    expect(bitrateFor(1920, 1080, 60)).toBe(b1080 * 2)
  })
  it('clamps tiny and huge inputs', () => {
    expect(bitrateFor(320, 200, 30)).toBe(MIN_VIDEO_BITRATE)
    expect(bitrateFor(3840, 2160, 60)).toBe(MAX_VIDEO_BITRATE)
  })
})
