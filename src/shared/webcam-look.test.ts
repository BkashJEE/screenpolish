import { describe, expect, it } from 'vitest'
import { DEFAULT_WEBCAM_LOOK, lightVector, needsSegmentation, sourceCrop, toneFilter } from './webcam-look'

const square = { width: 400, height: 400 }
const sensor = { width: 1280, height: 720 }

describe('sourceCrop', () => {
  it('cover-fits a 16:9 sensor into a square bubble', () => {
    const crop = sourceCrop(sensor, square, { zoom: 1, offsetX: 0, offsetY: 0 })
    // the full height is used and the width is trimmed to square, centred
    expect(crop.height).toBe(720)
    expect(crop.width).toBe(720)
    expect(crop.x).toBe(280)
    expect(crop.y).toBe(0)
  })

  it('crops in as zoom rises, staying centred', () => {
    const crop = sourceCrop(sensor, square, { zoom: 2, offsetX: 0, offsetY: 0 })
    expect(crop.width).toBe(360)
    expect(crop.height).toBe(360)
    expect(crop.x).toBe(460)
    expect(crop.y).toBe(180)
  })

  it('never lets a pan walk the crop off the sensor', () => {
    for (const [ox, oy] of [
      [-1, -1],
      [1, 1],
      [-4, 4]
    ]) {
      const crop = sourceCrop(sensor, square, { zoom: 1.5, offsetX: ox, offsetY: oy })
      expect(crop.x).toBeGreaterThanOrEqual(0)
      expect(crop.y).toBeGreaterThanOrEqual(0)
      expect(crop.x + crop.width).toBeLessThanOrEqual(sensor.width + 1e-9)
      expect(crop.y + crop.height).toBeLessThanOrEqual(sensor.height + 1e-9)
    }
  })

  it('clamps zoom below 1 so the crop can never exceed the sensor', () => {
    const crop = sourceCrop(sensor, square, { zoom: 0.2, offsetX: 0, offsetY: 0 })
    expect(crop.width).toBeLessThanOrEqual(sensor.width)
    expect(crop.height).toBeLessThanOrEqual(sensor.height)
  })

  it('survives a degenerate source or destination', () => {
    expect(sourceCrop({ width: 0, height: 0 }, square, DEFAULT_WEBCAM_LOOK)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(sourceCrop(sensor, { width: 0, height: 10 }, DEFAULT_WEBCAM_LOOK).width).toBe(1280)
  })
})

describe('lightVector', () => {
  it('points down from the top at 0 degrees and rotates clockwise', () => {
    const top = lightVector(0)
    expect(top.x).toBeCloseTo(0)
    expect(top.y).toBeCloseTo(-1)
    const right = lightVector(90)
    expect(right.x).toBeCloseTo(1)
    expect(right.y).toBeCloseTo(0)
  })
})

describe('toneFilter', () => {
  it('is empty when nothing is adjusted', () => {
    expect(toneFilter({ exposure: 0, contrast: 1 })).toBe('')
  })
  it('combines exposure and contrast', () => {
    const f = toneFilter({ exposure: 0.5, contrast: 1.2 })
    expect(f).toContain('brightness')
    expect(f).toContain('contrast')
  })
  it('clamps absurd values instead of emitting them', () => {
    expect(toneFilter({ exposure: 9, contrast: 9 })).toBe('brightness(1.550) contrast(2.000)')
  })
})

describe('needsSegmentation', () => {
  it('is false only for the untouched backdrop', () => {
    expect(needsSegmentation({ backdrop: 'none' })).toBe(false)
    for (const backdrop of ['blur', 'color', 'scene'] as const) {
      expect(needsSegmentation({ backdrop })).toBe(true)
    }
  })
})
