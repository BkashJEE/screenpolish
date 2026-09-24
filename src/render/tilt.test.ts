import { describe, expect, it } from 'vitest'
import { drawTilted, hasTilt, projectCard, quadBounds, type Ctx2D } from './tilt'

const rect = { x: 100, y: 50, width: 800, height: 450 }

function fakeCtx() {
  const calls: Array<{ name: string; args: unknown[] }> = []
  const ctx = new Proxy(
    {},
    {
      get(_t, name: string) {
        if (name === 'canvas') return { width: 1000, height: 600 }
        return (...args: unknown[]) => {
          calls.push({ name, args })
        }
      },
      set() {
        return true
      }
    }
  ) as unknown as Ctx2D
  return { ctx, calls }
}

describe('projectCard', () => {
  it('is the rect itself with no tilt', () => {
    const q = projectCard(rect, 0, 0)
    expect(q.tl).toEqual({ x: 100, y: 50 })
    expect(q.br).toEqual({ x: 900, y: 500 })
  })

  it('brings the left edge toward the viewer for a positive tiltX', () => {
    const q = projectCard(rect, 12, 0)
    const leftHeight = q.bl.y - q.tl.y
    const rightHeight = q.br.y - q.tr.y
    expect(leftHeight).toBeGreaterThan(rightHeight)
    expect(leftHeight).toBeGreaterThan(rect.height)
    expect(rightHeight).toBeLessThan(rect.height)
    // Symmetric around the centre line.
    expect((q.tl.y + q.bl.y) / 2).toBeCloseTo(rect.y + rect.height / 2, 6)
  })

  it('mirrors for a negative tiltX and swaps axes for tiltY', () => {
    const l = projectCard(rect, -12, 0)
    expect(l.br.y - l.tr.y).toBeGreaterThan(l.bl.y - l.tl.y)
    const up = projectCard(rect, 0, 10)
    const topWidth = up.tr.x - up.tl.x
    const bottomWidth = up.br.x - up.bl.x
    expect(topWidth).toBeGreaterThan(bottomWidth)
  })

  it('keeps the quad close to the rect centre so the frame does not wander', () => {
    const q = projectCard(rect, 9, -7)
    const b = quadBounds(q)
    expect(Math.abs(b.x + b.width / 2 - (rect.x + rect.width / 2))).toBeLessThan(rect.width * 0.03)
    expect(Math.abs(b.y + b.height / 2 - (rect.y + rect.height / 2))).toBeLessThan(rect.height * 0.03)
  })
})

describe('drawTilted', () => {
  it('draws one strip per slice, vertically for tiltX', () => {
    const { ctx, calls } = fakeCtx()
    const source = {} as CanvasImageSource
    drawTilted(ctx, source, { width: 800, height: 450 }, rect, 10, 0, 40)
    const draws = calls.filter((c) => c.name === 'drawImage')
    expect(draws).toHaveLength(40)
    // First strip is taller than the last (left edge near the viewer).
    const first = draws[0].args as number[]
    const last = draws[39].args as number[]
    expect(first[8]).toBeGreaterThan(last[8])
    // Source x advances across the card.
    expect(first[1]).toBe(0)
    expect(last[1]).toBeCloseTo((39 / 40) * 800, 6)
  })

  it('draws horizontal strips for a dominant tiltY', () => {
    const { ctx, calls } = fakeCtx()
    drawTilted(ctx, {} as CanvasImageSource, { width: 800, height: 450 }, rect, 0, 8, 10)
    const draws = calls.filter((c) => c.name === 'drawImage')
    expect(draws).toHaveLength(10)
    const first = draws[0].args as number[]
    expect(first[2]).toBe(0) // source y starts at 0
    expect(first[7]).toBeGreaterThan(rect.width) // top strip wider than the card
  })

  it('hasTilt ignores noise', () => {
    expect(hasTilt(0, 0)).toBe(false)
    expect(hasTilt(undefined, undefined)).toBe(false)
    expect(hasTilt(0.001, 0)).toBe(false)
    expect(hasTilt(3, 0)).toBe(true)
  })
})
