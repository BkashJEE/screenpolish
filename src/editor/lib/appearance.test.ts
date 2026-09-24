import { describe, expect, it } from 'vitest'
import { APPEARANCES, appearanceOf } from './appearance'

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
describe('app appearance', () => {
  it('falls back safely for absent, malformed and prototype keys', () => {
    for (const value of [null, undefined, '', 'green', '__proto__', 'constructor']) expect(appearanceOf(value)).toBe('charcoal')
    expect(appearanceOf('warm')).toBe('warm')
  })
  for (const [name, {colors}] of Object.entries(APPEARANCES)) {
    it(`${name} supports readable normal and secondary text`, () => {
      for (const background of colors.slice(0, 4)) for (const text of colors.slice(5, 8)) expect(contrast(background, text)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors[8], colors[0])).toBeGreaterThanOrEqual(4.5)
    })
  }
})
