import { describe, expect, it } from 'vitest'
import { blurRadiusPx, deviceRect, isShapeKind, redactionCellPx, shapeAspect } from './overlays'
import { createOverlay, duplicateOverlay, overlayEquals, overlayLabel } from '../editor/lib/overlays'

const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

describe('callout shapes', () => {
  it('recognises shape kinds only', () => {
    expect(['arrow', 'box', 'blur'].every((k) => isShapeKind(k as never))).toBe(true)
    expect(isShapeKind('text')).toBe(false)
  })

  it('clamps the shape aspect to a drawable range', () => {
    expect(shapeAspect({ shape: { color: '#fff', thickness: 1, aspect: 0 } })).toBe(0.05)
    expect(shapeAspect({ shape: { color: '#fff', thickness: 1, aspect: 99 } })).toBe(4)
    expect(shapeAspect({})).toBe(0.5)
  })

  it('pixelates coarsely enough that a line of text cannot be read', () => {
    // Default strength: the short side becomes 4 rows of blocks.
    expect(redactionCellPx(600, 80)).toBe(20)
    // Never finer than 10 px, even for a small box at the lowest strength.
    expect(redactionCellPx(40, 20, 1)).toBe(10)
    // Strongest setting is 2 rows; weakest is 11.
    expect(redactionCellPx(600, 200, 10)).toBe(100)
    expect(redactionCellPx(600, 220, 1)).toBe(20)
    expect(blurRadiusPx(40, 20)).toBe(4)
  })

  it('maps a box through the canvas transform and clamps it to the canvas', () => {
    expect(deviceRect(identity, { x: 10.4, y: 20.6, width: 50, height: 30 }, { width: 1920, height: 1080 })).toEqual({ x: 10, y: 20, width: 51, height: 31 })
    const scaled = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 }
    expect(deviceRect(scaled, { x: 0, y: 0, width: 10, height: 10 }, { width: 1920, height: 1080 })).toEqual({ x: 100, y: 50, width: 20, height: 20 })
    expect(deviceRect(identity, { x: 1900, y: 1070, width: 100, height: 100 }, { width: 1920, height: 1080 })).toEqual({ x: 1900, y: 1070, width: 20, height: 10 })
    expect(deviceRect(identity, { x: 3000, y: 0, width: 10, height: 10 }, { width: 1920, height: 1080 })).toBeNull()
  })

  it('creates callouts pinned to the video, and blur without a fade', () => {
    const arrow = createOverlay({ kind: 'arrow', content: '', t: 2, duration: 30 })
    const blur = createOverlay({ kind: 'blur', content: '', t: 2, duration: 30 })
    expect(arrow.pinned).toBe(true)
    expect(arrow.shape?.color).toBe('#ff3b30')
    expect(blur.fadeSec).toBe(0)
    expect(blur.shape?.mode).toBe('pixelate')
    expect(overlayLabel(blur)).toBe('Pixelate')
  })

  it('compares and copies shape settings by value', () => {
    const box = createOverlay({ kind: 'box', content: '', t: 0, duration: 10 })
    const copy = duplicateOverlay(box)
    expect(copy.shape).toEqual(box.shape)
    expect(copy.shape).not.toBe(box.shape)
    expect(overlayEquals(box, { ...box, shape: { ...box.shape!, thickness: 9 } })).toBe(false)
    expect(overlayEquals(box, { ...box, shape: { ...box.shape! } })).toBe(true)
  })
})
