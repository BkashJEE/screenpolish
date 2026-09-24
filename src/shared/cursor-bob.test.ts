import { expect, it } from 'vitest'
import { cursorBobAt } from './cursor-bob'

it('is deterministic when seeking and contains no hotspot translation', () => {
  expect(cursorBobAt(3.5, 0.1)).toEqual(cursorBobAt(3.5, 0.1))
  expect(Object.keys(cursorBobAt(1, 1))).toEqual(['rotation', 'scaleX', 'scaleY'])
})
it('keeps motion subtle and finite', () => {
  for (let t = 0; t < 10; t += 0.01) {
    const motion = cursorBobAt(t, t % 1)
    expect(Math.abs(motion.rotation)).toBeLessThanOrEqual(0.045)
    expect(motion.scaleX).toBeGreaterThan(0.8)
    expect(motion.scaleY).toBeGreaterThan(0.75)
    expect(motion.scaleY).toBeLessThan(1.2)
  }
  expect(cursorBobAt(NaN, NaN)).toEqual({ rotation: 0, scaleX: 1, scaleY: 1 })
})
