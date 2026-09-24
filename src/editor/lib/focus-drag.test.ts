import { describe, expect, it } from 'vitest'
import { focusFromThumbnailPointer } from './focus-drag'

describe('focusFromThumbnailPointer', () => {
  const rect = { left: 100, top: 50, width: 320, height: 180 }
  const source = { width: 1920, height: 1080 }

  it('maps the thumbnail centre to the source centre', () => {
    expect(focusFromThumbnailPointer({ x: 260, y: 140 }, rect, source)).toEqual({ x: 960, y: 540 })
  })

  it('maps thumbnail corners to source corners', () => {
    expect(focusFromThumbnailPointer({ x: 100, y: 50 }, rect, source)).toEqual({ x: 0, y: 0 })
    expect(focusFromThumbnailPointer({ x: 420, y: 230 }, rect, source)).toEqual({ x: 1920, y: 1080 })
  })

  it('clamps pointer positions outside the thumbnail', () => {
    expect(focusFromThumbnailPointer({ x: -60, y: 999 }, rect, source)).toEqual({ x: 0, y: 1080 })
  })

  it('returns finite safe values for invalid dimensions', () => {
    expect(focusFromThumbnailPointer({ x: 260, y: 140 }, { ...rect, width: 0 }, source)).toEqual({ x: 960, y: 540 })
    expect(focusFromThumbnailPointer({ x: 260, y: 140 }, rect, { width: Number.NaN, height: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 })
    expect(focusFromThumbnailPointer({ x: 260, y: 140 }, { ...rect, left: Number.NaN }, source)).toEqual({ x: 960, y: 540 })
  })

  it('falls back to the source centre for non-finite pointer input', () => {
    expect(focusFromThumbnailPointer({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, rect, source)).toEqual({ x: 960, y: 540 })
  })
})
