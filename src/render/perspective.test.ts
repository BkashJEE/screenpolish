import { describe, expect, it } from 'vitest'
import { perspectiveVertices, drawPerspective } from './perspective'
import { projectCard, type Ctx2D } from './tilt'

const rect = { x: 123, y: 75, width: 800, height: 450 }
function pixels(x: number, y: number) {
  const v = perspectiveVertices(rect, x, y, 1280, 720)
  return [0, 1, 2, 3].map((i) => ({
    x: (v[i * 5] / v[i * 5 + 2] + 1) * 640,
    y: (1 - v[i * 5 + 1] / v[i * 5 + 2]) * 360
  }))
}
describe('projective texture', () => {
  it.each([[0, 0], [12, 0], [0, -10], [8, 8], [-12, 4]])('matches the shadow at %s / %s degrees', (x, y) => {
    const q = projectCard(rect, x, y)
    const expected = [q.tl, q.tr, q.bl, q.br]
    pixels(x, y).forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 3)
      expect(p.y).toBeCloseTo(expected[i].y, 3)
    })
  })
  it('does not switch geometry at the dominant-axis crossing', () => {
    const before = pixels(8 - 0.0001, 8)
    const after = pixels(8 + 0.0001, 8)
    before.forEach((p, i) => expect(Math.hypot(p.x - after[i].x, p.y - after[i].y)).toBeLessThan(0.002))
  })
  it('preserves texture corners and has positive homogeneous depth', () => {
    const v = perspectiveVertices(rect, 12, 8, 1280, 720)
    expect([v[3], v[4], v[8], v[9], v[13], v[14], v[18], v[19]]).toEqual([0, 0, 1, 0, 0, 1, 1, 1])
    for (let i = 0; i < 4; i++) expect(v[i * 5 + 2]).toBeGreaterThan(0)
  })
  it('permits a Canvas2D fallback when OffscreenCanvas is unavailable', () => {
    expect(drawPerspective({} as Ctx2D, {} as OffscreenCanvas, rect, 12, 4)).toBe(false)
  })
})
