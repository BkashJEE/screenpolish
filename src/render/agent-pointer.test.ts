import { describe, expect, it } from 'vitest'
import type { Ctx2D } from '../shared/ctx2d'
import { AGENT_POINTER_COLOR, drawCursor, drawSpotlight } from './render-frame'

/** Records fills, strokes and gradient stops; enough of a 2D context for these two drawers. */
function recorder() {
  const log: Array<{ op: string; style?: unknown; width?: number }> = []
  const stops: Array<[number, string]> = []
  const ctx = {
    canvas: { width: 1920, height: 1080 },
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    save() {}, restore() {}, translate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() { log.push({ op: 'fill', style: ctx.fillStyle }) },
    stroke() { log.push({ op: 'stroke', style: ctx.strokeStyle, width: ctx.lineWidth }) },
    fillRect(x: number, y: number, w: number, h: number) { log.push({ op: `fillRect ${x},${y},${w},${h}`, style: ctx.fillStyle }) },
    createRadialGradient() { return { addColorStop: (o: number, c: string) => stops.push([o, c]) } }
  }
  return { ctx: ctx as unknown as Ctx2D, log, stops }
}

describe('Agent pointer', () => {
  it('draws a dark edge, a white outline and a coloured body, in that order', () => {
    const { ctx, log } = recorder()
    drawCursor(ctx, 100, 100, 24, 'agent', '#36c2ff')
    expect(log.map((l) => l.op)).toEqual(['stroke', 'stroke', 'fill'])
    expect(log[1]!.style).toBe('#ffffff')
    expect(log[0]!.width!).toBeGreaterThan(log[1]!.width!)
    expect(log[2]!.style).toBe('#36c2ff')
  })

  it('falls back to its violet for a missing or malformed colour', () => {
    for (const bad of [undefined, 'red', '#12345', 'javascript:']) {
      const { ctx, log } = recorder()
      drawCursor(ctx, 0, 0, 24, 'agent', bad)
      expect(log.at(-1)!.style).toBe(AGENT_POINTER_COLOR)
    }
  })
})

describe('Spotlight', () => {
  it('leaves the pointer clear and darkens the rest of the recording', () => {
    const { ctx, log, stops } = recorder()
    drawSpotlight(ctx, 500, 400, 200, 1)
    expect(log).toEqual([{ op: 'fillRect 0,0,1920,1080', style: expect.anything() }])
    expect(stops[0]).toEqual([0, 'rgba(0, 0, 0, 0)'])
    expect(stops[1]).toEqual([1, 'rgba(0, 0, 0, 0.650)'])
  })

  it('scales with strength and does nothing at 0', () => {
    const half = recorder()
    drawSpotlight(half.ctx, 0, 0, 100, 0.5)
    expect(half.stops[1]).toEqual([1, 'rgba(0, 0, 0, 0.325)'])
    const off = recorder()
    drawSpotlight(off.ctx, 0, 0, 100, 0)
    drawSpotlight(off.ctx, 0, 0, 0, 1)
    expect(off.log).toEqual([])
  })
})
