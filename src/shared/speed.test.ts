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
