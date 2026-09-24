import { describe, expect, it } from 'vitest'
import { snapRange, snapTime } from './snapping'

describe('snapTime', () => {
  it('chooses the nearest target inside the threshold', () => {
    expect(snapTime(4.92, [0, 5, 10], 0.1)).toEqual({ value: 5, target: 5 })
  })

  it('leaves a point alone outside the threshold', () => {
    expect(snapTime(4.8, [5], 0.1)).toEqual({ value: 4.8, target: null })
  })
})

describe('snapRange', () => {
  it('preserves duration while snapping the closest edge', () => {
    const result = snapRange(2.08, 5.08, [2, 5.2], 0.15)
    expect(result).toEqual({ start: 2, end: 5, target: 2 })
    expect(result.end - result.start).toBeCloseTo(3)
  })

  it('does not move a range when neither edge is close', () => {
    expect(snapRange(2, 5, [8], 0.2)).toEqual({ start: 2, end: 5, target: null })
  })
})
