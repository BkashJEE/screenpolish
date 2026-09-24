import { describe, expect, it } from 'vitest'
import { frameOffsetFromDelta } from './frame-drag'

describe('frameOffsetFromDelta', () => {
  it('normalizes output-pixel movement and clamps both axes', () => {
    expect(frameOffsetFromDelta({ x: 192, y: -108 }, { offsetX: 0.1, offsetY: 0.2 }, { width: 960, height: 540 })).toEqual({ offsetX: 0.3, offsetY: 0 })
    expect(frameOffsetFromDelta({ x: 9999, y: -9999 }, { offsetX: 0.4, offsetY: -0.4 }, { width: 960, height: 540 })).toEqual({ offsetX: 0.5, offsetY: -0.5 })
  })

  it('ignores invalid output sizes and deltas', () => {
    expect(frameOffsetFromDelta({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, { offsetX: 0.2, offsetY: -0.2 }, { width: 0, height: Number.NaN })).toEqual({ offsetX: 0.2, offsetY: -0.2 })
  })
})
