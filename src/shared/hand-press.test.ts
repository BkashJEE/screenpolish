import { describe, expect, it } from 'vitest'
import { handPressAt } from './hand-press'

describe('soft hand press', () => {
  it('rests without bobbing, including invalid and future timestamps', () => {
    for (const age of [-1, 0, 0.28, 1, Infinity, NaN]) {
      expect(handPressAt(age)).toEqual({ scaleX: 1, scaleY: 1 })
    }
  })
  it('compresses gently without overshoot and does not move the hotspot', () => {
    expect(handPressAt(0.14)).toEqual({ scaleX: 1.025, scaleY: 0.92 })
    for (let i = 0; i <= 280; i++) {
      const pose = handPressAt(i / 1000)
      expect(pose.scaleX).toBeGreaterThanOrEqual(1)
      expect(pose.scaleX).toBeLessThanOrEqual(1.025)
      expect(pose.scaleY).toBeGreaterThanOrEqual(0.92)
      expect(pose.scaleY).toBeLessThanOrEqual(1)
      expect([0 * pose.scaleX, 0 * pose.scaleY]).toEqual([0, 0])
    }
  })
  it('is independent of frame order and frame rate', () => {
    const expected = handPressAt(0.1)
    handPressAt(0.2)
    handPressAt(0.05)
    expect(handPressAt(0.1)).toEqual(expected)
    expect(handPressAt(6 / 60)).toEqual(handPressAt(3 / 30))
  })
})
