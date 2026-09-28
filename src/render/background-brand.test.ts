import { describe, expect, it, vi } from 'vitest'
import { brandImagePath, brandOrigin, drawBackgroundBrand, type Ctx2D } from './render-frame'

/** A 2D context that records text, rectangles and strokes with the colour each used. */
function recordingContext() {
  const texts: Array<{ text: string; font: string; fillStyle: string }> = []
  const rects: Array<{ x: number; y: number; w: number; h: number; fillStyle: string }> = []
  const strokes: string[] = []
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    font: '', letterSpacing: '0px', fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1, lineCap: '', lineJoin: '', textAlign: '', textBaseline: '',
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText(text: string) {
      texts.push({ text, font: this.font, fillStyle: this.fillStyle })
    },
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fillStyle: this.fillStyle })
    },
    stroke() {
      strokes.push(this.strokeStyle)
    }
  }
  return { ctx, texts, rects, strokes }
}

describe('background branding', () => {
  // Pack-specific lettering is covered by src/brand/draw.test.ts; an edition
  // without a pack still has to behave the same here.


  it('draws the Omarchy wordmark glyph in its bundled face', () => {
    const { ctx, texts } = recordingContext()
    drawBackgroundBrand(ctx as unknown as Ctx2D, { width: 1920, height: 1080 }, 'bundled:backgrounds/omarchy.png', true)
    expect(texts).toHaveLength(1)
    expect(texts[0].text).toBe('\ue900')
    expect(texts[0].font).toContain('Omarchy Brand')
    expect(ctx.restore).toHaveBeenCalledOnce()
  })
  it('does not brand custom images', () => {
    const ctx = { save: vi.fn() }
    drawBackgroundBrand(ctx as unknown as Ctx2D, { width: 1080, height: 1920 }, '/custom/image.png', true)
    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('leaves projects saved before themes existed unbranded', () => {
    const ctx = { save: vi.fn() }
    drawBackgroundBrand(ctx as unknown as Ctx2D, { width: 1920, height: 1080 }, 'bundled:backgrounds/legacy.jpg')
    expect(ctx.save).not.toHaveBeenCalled()
  })
})

describe('brandImagePath', () => {
  it('names the theme only while the background is that image', () => {
    expect(brandImagePath({ kind: 'image', imagePath: 'bundled:backgrounds/legacy.jpg' })).toBe('bundled:backgrounds/legacy.jpg')
  })

  it('draws no theme name on a gradient or solid, even with the old image path and flag still in the project', () => {
    // The owner's take: Omarchy theme picked, then switched to a gradient.
    expect(brandImagePath({ kind: 'gradient', imagePath: 'bundled:backgrounds/omarchy.png' })).toBeUndefined()
    expect(brandImagePath({ kind: 'solid', imagePath: 'bundled:backgrounds/legacy.jpg' })).toBeUndefined()
  })
})

describe('brandOrigin', () => {
  const size = { width: 1920, height: 1080 }
  const box = { width: 300, height: 60 }

  it('keeps the top-left corner as the default so older exports do not move', () => {
    expect(brandOrigin(size, box)).toEqual(brandOrigin(size, box, 'top-left'))
    expect(brandOrigin(size, box).x).toBeCloseTo(1080 * 0.028)
  })

  it('centres horizontally at the top and bottom', () => {
    expect(brandOrigin(size, box, 'top').x).toBe((1920 - 300) / 2)
    expect(brandOrigin(size, box, 'bottom').x).toBe((1920 - 300) / 2)
  })

  it('puts the bottom position the same distance from the bottom edge as the top one from the top', () => {
    const top = brandOrigin(size, box, 'top')
    const bottom = brandOrigin(size, box, 'bottom')
    expect(1080 - (bottom.y + box.height)).toBeCloseTo(top.y)
  })

})
