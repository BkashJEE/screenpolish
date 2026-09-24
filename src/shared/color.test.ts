import { describe, expect, it } from 'vitest'
import { hexToHsv, hexToRgb, hsvToHex, normalizeHex, rgbToHex, rgbToHsv } from './color'

describe('normalizeHex', () => {
  it('accepts long, short, unprefixed and mixed case', () => {
    expect(normalizeHex('#F312D8')).toBe('#f312d8')
    expect(normalizeHex('f312d8')).toBe('#f312d8')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
    expect(normalizeHex('  #ABC  ')).toBe('#aabbcc')
  })

  it('rejects anything else', () => {
    for (const bad of ['', '#12', 'rgb(1,2,3)', '#12345g', '#1234567']) expect(normalizeHex(bad)).toBeNull()
  })
})

describe('rgb and hex', () => {
  it('round-trips', () => {
    expect(hexToRgb('#f312d8')).toEqual({ r: 243, g: 18, b: 216 })
    expect(rgbToHex({ r: 243, g: 18, b: 216 })).toBe('#f312d8')
  })

  it('clamps and rounds out-of-range channels', () => {
    expect(rgbToHex({ r: -5, g: 255.4, b: 300 })).toBe('#00ffff')
  })
})

describe('hsv', () => {
  it('matches known colours', () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 })
    const green = rgbToHsv({ r: 0, g: 128, b: 0 })
    expect(green.h).toBeCloseTo(120)
    expect(green.s).toBeCloseTo(1)
    expect(green.v).toBeCloseTo(128 / 255)
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it('round-trips every hex through hsv', () => {
    for (const hex of ['#f312d8', '#000000', '#ffffff', '#123456', '#7aa2f7', '#39445f']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })

  it('wraps hue and clamps s/v', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe(hsvToHex({ h: 0, s: 1, v: 1 }))
    expect(hsvToHex({ h: -60, s: 2, v: 2 })).toBe(hsvToHex({ h: 300, s: 1, v: 1 }))
  })
})
