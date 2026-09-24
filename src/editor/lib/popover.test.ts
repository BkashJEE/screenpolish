import { describe, expect, it } from 'vitest'
import { placePopover } from './popover'

const viewport = { width: 1280, height: 800 }
const size = { width: 240, height: 260 }

describe('placePopover', () => {
  it('opens below, left-aligned with the anchor when there is room', () => {
    const p = placePopover({ anchor: { left: 400, top: 100, width: 24, height: 24 }, size, viewport })
    expect(p).toEqual({ left: 400, top: 132, side: 'below' })
  })

  it('keeps a picker opened from the right-hand inspector inside the window', () => {
    // The swatch sits 40px from the right edge: the old native picker ran off screen.
    const anchor = { left: viewport.width - 40, top: 200, width: 24, height: 24 }
    const p = placePopover({ anchor, size, viewport })
    expect(p.left + size.width).toBeLessThanOrEqual(viewport.width - 8)
    expect(p.left).toBeGreaterThanOrEqual(8)
  })

  it('flips above the anchor when below would overflow', () => {
    const p = placePopover({ anchor: { left: 100, top: 700, width: 24, height: 24 }, size, viewport })
    expect(p.side).toBe('above')
    expect(p.top).toBe(700 - 8 - size.height)
  })

  it('clamps rather than going off the top when neither side fits', () => {
    const tall = { width: 240, height: 780 }
    const p = placePopover({ anchor: { left: 10, top: 400, width: 24, height: 24 }, size: tall, viewport })
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.left).toBeGreaterThanOrEqual(8)
  })
})
