import { describe, expect, it } from 'vitest'
import { MIN_CROP_SIZE, cropCursor, cropFromPoints, cropGestureAt, moveCrop, resizeCrop } from './crop-interaction'

describe('crop interaction', () => {
  it('normalizes reverse drags', () => {
    const crop = cropFromPoints({ x: .8, y: .7 }, { x: .2, y: .1 })
    expect(crop.x).toBeCloseTo(.2)
    expect(crop.y).toBeCloseTo(.1)
    expect(crop.width).toBeCloseTo(.6)
    expect(crop.height).toBeCloseTo(.6)
  })
  it('clamps points and keeps a tiny range usable', () => {
    const crop = cropFromPoints({ x: -1, y: 2 }, { x: 0, y: 2 })
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(1 - crop.height)
    expect(crop.width).toBeGreaterThan(0)
    expect(crop.height).toBeGreaterThan(0)
  })
  it('moves without leaving the source', () => expect(moveCrop({ x: .7, y: .7, width: .3, height: .3 }, .4, -.9)).toEqual({ x: .7, y: 0, width: .3, height: .3 }))
})

const FULL = { x: 0, y: 0, width: 1, height: 1 }
const TOL = { x: 0.02, y: 0.02 }
const BOX = { x: 0.2, y: 0.2, width: 0.5, height: 0.4 }

describe('cropGestureAt', () => {
  it('draws a new rectangle when the take is uncropped, instead of trying to move the whole frame', () => {
    expect(cropGestureAt({ x: 0.5, y: 0.5 }, FULL, TOL)).toEqual({ mode: 'draw' })
  })

  it('still lets the edges of an uncropped take be dragged in', () => {
    expect(cropGestureAt({ x: 0.005, y: 0.5 }, FULL, TOL)).toEqual({ mode: 'resize', edges: { left: true, right: false, top: false, bottom: false } })
    expect(cropGestureAt({ x: 0.995, y: 0.995 }, FULL, TOL)).toEqual({ mode: 'resize', edges: { left: false, right: true, top: false, bottom: true } })
  })

  it('moves a real selection from inside, and draws from outside it', () => {
    expect(cropGestureAt({ x: 0.45, y: 0.4 }, BOX, TOL)).toEqual({ mode: 'move' })
    expect(cropGestureAt({ x: 0.9, y: 0.9 }, BOX, TOL)).toEqual({ mode: 'draw' })
  })

  it('resizes from a corner, and from an edge', () => {
    expect(cropGestureAt({ x: 0.2, y: 0.2 }, BOX, TOL)).toEqual({ mode: 'resize', edges: { left: true, right: false, top: true, bottom: false } })
    expect(cropGestureAt({ x: 0.71, y: 0.4 }, BOX, TOL)).toEqual({ mode: 'resize', edges: { left: false, right: true, top: false, bottom: false } })
  })

  it('does not treat a point level with an edge but far outside the box as that edge', () => {
    expect(cropGestureAt({ x: 0.2, y: 0.95 }, BOX, TOL)).toEqual({ mode: 'draw' })
  })

  it('grabs only the nearer side of a crop too thin for two grab zones', () => {
    const thin = { x: 0.5, y: 0.2, width: 0.02, height: 0.4 }
    expect(cropGestureAt({ x: 0.505, y: 0.4 }, thin, TOL)).toMatchObject({ mode: 'resize', edges: { left: true, right: false } })
    expect(cropGestureAt({ x: 0.516, y: 0.4 }, thin, TOL)).toMatchObject({ mode: 'resize', edges: { left: false, right: true } })
  })
})

describe('resizeCrop', () => {
  it('drags one edge and leaves the others', () => {
    const r = resizeCrop(BOX, { left: false, right: true, top: false, bottom: false }, 0.1, 0.3)
    expect(r.x).toBeCloseTo(0.2)
    expect(r.width).toBeCloseTo(0.6)
    expect(r.height).toBeCloseTo(0.4)
  })

  it('drags a corner on both axes', () => {
    const r = resizeCrop(FULL, { left: true, right: false, top: true, bottom: false }, 0.25, 0.1)
    expect([r.x, r.y, r.width, r.height].map((v) => +v.toFixed(6))).toEqual([0.25, 0.1, 0.75, 0.9])
  })

  it('stops at the frame and at the minimum size instead of flipping', () => {
    const out = resizeCrop(BOX, { left: true, right: false, top: false, bottom: false }, -1, 0)
    expect(out.x).toBe(0)
    const tiny = resizeCrop(BOX, { left: true, right: false, top: false, bottom: false }, 0.9, 0)
    expect(tiny.width).toBeCloseTo(MIN_CROP_SIZE)
    expect(tiny.x + tiny.width).toBeCloseTo(0.7)
  })
})

describe('cropCursor', () => {
  it('shows what a press would do', () => {
    expect(cropCursor({ mode: 'draw' })).toBe('crosshair')
    expect(cropCursor({ mode: 'move' })).toBe('move')
    expect(cropCursor({ mode: 'resize', edges: { left: true, right: false, top: true, bottom: false } })).toBe('nwse-resize')
    expect(cropCursor({ mode: 'resize', edges: { left: false, right: true, top: true, bottom: false } })).toBe('nesw-resize')
    expect(cropCursor({ mode: 'resize', edges: { left: false, right: false, top: false, bottom: true } })).toBe('ns-resize')
  })
})
