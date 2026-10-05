import { describe, it, expect } from 'vitest'
import { speedSpans, sourceTimeAt, speedAt } from './speed'

describe('speed timeline', () => {
  it('retimes only the chosen region and preserves source timestamps', () => {
    const spans = speedSpans(10, 20, [{ id: 'a', start: 12, end: 16, rate: 2 }])
    expect(spans.at(-1)?.outputEnd).toBe(8)
    expect(sourceTimeAt(2, spans)).toBe(12)
    expect(sourceTimeAt(3, spans)).toBe(14)
    expect(sourceTimeAt(4, spans)).toBe(16)
    expect(sourceTimeAt(8, spans)).toBe(20)
  })
  it('clips speed regions to trim and bounds invalid rates', () => {
    const spans = speedSpans(12, 14, [{ id: 'a', start: 0, end: 100, rate: 0.5 }])
    expect(spans.at(-1)?.outputEnd).toBe(4)
    expect(speedAt(2, [{ id: 'a', start: 0, end: 4, rate: NaN }])).toBe(1)
  })
})

describe('speed ramps', () => {
  const region = (patch: Partial<{ start: number; end: number; rate: number; ease: number }> = {}) => ({
    id: 'a', start: 10, end: 20, rate: 2, ...patch
  })

  it('leaves a region without an ease as the hard step it always was', () => {
    const regions = [region()]
    expect(speedAt(10.01, regions)).toBe(2)
    expect(speedAt(19.99, regions)).toBe(2)
    expect(speedSpans(0, 30, regions)).toHaveLength(3)
  })

  it('eases from 1x up to the rate and back down again', () => {
    const regions = [region({ ease: 2 })]
    expect(speedAt(10, regions)).toBeCloseTo(1, 5)      // the very start
    expect(speedAt(11, regions)).toBeCloseTo(1.5, 5)    // half way in, by smoothstep
    expect(speedAt(12, regions)).toBeCloseTo(2, 5)      // ramp finished
    expect(speedAt(15, regions)).toBe(2)                // plateau
    expect(speedAt(18, regions)).toBeCloseTo(2, 5)      // ramp out begins
    expect(speedAt(19, regions)).toBeCloseTo(1.5, 5)
    expect(speedAt(19.999, regions)).toBeCloseTo(1, 2)  // back to normal by the end
  })

  it('rises without a step, which is the whole point', () => {
    const regions = [region({ ease: 2 })]
    let previous = speedAt(10, regions)
    for (let t = 10; t <= 12; t += 0.05) {
      const rate = speedAt(t, regions)
      expect(rate - previous).toBeLessThan(0.08) // no jump anywhere along the ramp
      expect(rate).toBeGreaterThanOrEqual(previous - 1e-9) // and it only ever climbs
      previous = rate
    }
  })

  it('never lets the two ramps overlap, however long an ease is asked for', () => {
    // A 10s region cannot ease for 30s at each end; it would never reach 2x.
    const regions = [region({ ease: 30 })]
    expect(speedAt(15, regions)).toBeCloseTo(2, 5)
    expect(speedAt(10, regions)).toBeCloseTo(1, 5)
  })

  it('still lands on the right source time after an eased region', () => {
    const spans = speedSpans(0, 30, [region({ ease: 2 })])
    const last = spans.at(-1)
    expect(last?.end).toBe(30)
    // Playing to the end of the output must arrive at the end of the source.
    expect(sourceTimeAt(last?.outputEnd ?? 0, spans)).toBeCloseTo(30, 5)
    // An eased region saves less time than a hard one, because it spends part
    // of its length below the rate it was asked for.
    const hard = speedSpans(0, 30, [region()]).at(-1)?.outputEnd ?? 0
    expect(last?.outputEnd).toBeGreaterThan(hard)
  })

  it('keeps the span count inside the pitch-preserving export budget', () => {
    const many = Array.from({ length: 8 }, (_, i) => region({ start: i * 10, end: i * 10 + 8, ease: 1 }))
    expect(speedSpans(0, 100, many).length).toBeLessThan(512)
  })

  it('treats a nonsense ease as no ease at all', () => {
    expect(speedAt(15, [region({ ease: Number.NaN })])).toBe(2)
    expect(speedAt(15, [region({ ease: -5 })])).toBe(2)
  })
})
