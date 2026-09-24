import { describe, expect, it } from 'vitest'
import { createPointerThinner, mapButton, thinPointer, toRegionRelative, wheelDy, type PointerSample } from './input-math'

describe('thinPointer', () => {
  it('keeps the first sample and drops samples closer than the gap', () => {
    const samples: PointerSample[] = [
      [0, 0, 0],
      [3, 1, 1],
      [7, 2, 2],
      [8, 3, 3],
      [12, 4, 4],
      [16, 5, 5],
      [100, 6, 6]
    ]
    expect(thinPointer(samples, 8)).toEqual([
      [0, 0, 0],
      [8, 3, 3],
      [16, 5, 5],
      [100, 6, 6]
    ])
  })

  it('never exceeds 120 Hz on a dense 1 kHz stream', () => {
    const samples: PointerSample[] = []
    for (let t = 0; t < 1000; t++) samples.push([t, t, t])
    const thinned = thinPointer(samples)
    expect(thinned.length).toBeLessThanOrEqual(125)
    for (let i = 1; i < thinned.length; i++) expect(thinned[i][0] - thinned[i - 1][0]).toBeGreaterThanOrEqual(8)
  })

  it('handles empty input and does not mutate', () => {
    expect(thinPointer([])).toEqual([])
    const s: PointerSample[] = [[0, 0, 0], [1, 1, 1]]
    thinPointer(s)
    expect(s).toHaveLength(2)
  })

  it('streaming thinner agrees with the batch version', () => {
    const samples: PointerSample[] = [
      [0, 0, 0],
      [5, 0, 0],
      [9, 0, 0],
      [16, 0, 0],
      [17, 0, 0],
      [30, 0, 0]
    ]
    const keep = createPointerThinner(8)
    const streamed = samples.filter((s) => keep(s[0]))
    expect(streamed).toEqual(thinPointer(samples, 8))
  })
})

describe('toRegionRelative', () => {
  it('subtracts the region origin', () => {
    expect(toRegionRelative(1500, 900, { x: 1000, y: 500 })).toEqual([500, 400])
  })
  it('allows negative results when the pointer leaves the region', () => {
    expect(toRegionRelative(10, 10, { x: 100, y: 100 })).toEqual([-90, -90])
  })
})

describe('mapButton', () => {
  it('maps uiohook buttons', () => {
    expect(mapButton(1)).toBe('left')
    expect(mapButton(2)).toBe('right')
    expect(mapButton(3)).toBe('middle')
    expect(mapButton(4)).toBeNull()
    expect(mapButton(undefined)).toBeNull()
  })
})

describe('wheelDy', () => {
  it('keeps sign and magnitude and zeroes junk', () => {
    expect(wheelDy(1)).toBe(1)
    expect(wheelDy(-3)).toBe(-3)
    expect(wheelDy(0)).toBe(0)
    expect(wheelDy(Number.NaN)).toBe(0)
  })
})
