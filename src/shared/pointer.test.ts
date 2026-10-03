import { describe, expect, it } from 'vitest'
import type { RecordingEvents } from './types'
import { pointerAt, ripplesAt, smoothPointerPath, smoothedPointerAt } from './pointer'

const region = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }

function makeEvents(partial: Partial<RecordingEvents> = {}): RecordingEvents {
  return { version: 1, startedAt: 0, region, pointer: [], clicks: [], wheel: [], keys: [], ...partial }
}

describe('pointerAt', () => {
  const events = makeEvents({
    pointer: [
      [100, 10, 20],
      [200, 30, 40],
      [400, 70, 80]
    ]
  })

  it('returns null without samples', () => {
    expect(pointerAt(makeEvents(), 1)).toBeNull()
  })

  it('holds the first sample before the log starts', () => {
    expect(pointerAt(events, 0)).toEqual({ x: 10, y: 20 })
    expect(pointerAt(events, 0.05)).toEqual({ x: 10, y: 20 })
  })

  it('holds the last sample after the log ends', () => {
    expect(pointerAt(events, 0.4)).toEqual({ x: 70, y: 80 })
    expect(pointerAt(events, 9)).toEqual({ x: 70, y: 80 })
  })

  it('returns exact samples at their timestamps', () => {
    expect(pointerAt(events, 0.1)).toEqual({ x: 10, y: 20 })
    expect(pointerAt(events, 0.2)).toEqual({ x: 30, y: 40 })
  })

  it('interpolates linearly between samples', () => {
    expect(pointerAt(events, 0.15)).toEqual({ x: 20, y: 30 })
    const p = pointerAt(events, 0.35)
    expect(p?.x).toBeCloseTo(60)
    expect(p?.y).toBeCloseTo(70)
  })

  it('works with a single sample', () => {
    const one = makeEvents({ pointer: [[500, 5, 6]] })
    expect(pointerAt(one, 0)).toEqual({ x: 5, y: 6 })
    expect(pointerAt(one, 1)).toEqual({ x: 5, y: 6 })
  })

  it('handles duplicate timestamps without dividing by zero', () => {
    const dup = makeEvents({
      pointer: [
        [100, 0, 0],
        [100, 10, 10],
        [200, 20, 20]
      ]
    })
    const p = pointerAt(dup, 0.1)
    expect(Number.isFinite(p?.x)).toBe(true)
    expect(Number.isFinite(p?.y)).toBe(true)
  })

  it('finds the right span in a long log (binary search)', () => {
    const pointer: Array<[number, number, number]> = []
    for (let i = 0; i <= 1000; i++) pointer.push([i * 10, i, i * 2])
    const long = makeEvents({ pointer })
    expect(pointerAt(long, 5.005)).toEqual({ x: 500.5, y: 1001 })
    expect(pointerAt(long, 9.99)).toEqual({ x: 999, y: 1998 })
  })
})

describe('smoothPointerPath', () => {
  it('returns an empty path without samples', () => {
    expect(smoothPointerPath(makeEvents(), 1)).toEqual([])
  })

  it('resamples at the requested fps from 0 to the last sample', () => {
    const events = makeEvents({
      pointer: [
        [0, 0, 0],
        [1000, 120, 240]
      ]
    })
    const path = smoothPointerPath(events, 0, 120)
    expect(path).toHaveLength(121)
    expect(path[0]).toEqual([0, 0, 0])
    expect(path[60][0]).toBeCloseTo(500)
    expect(path[60][1]).toBeCloseTo(60)
    expect(path[60][2]).toBeCloseTo(120)
    expect(path[120][0]).toBeCloseTo(1000)
    expect(path[120][1]).toBeCloseTo(120)
    const ten = smoothPointerPath(events, 0, 10)
    expect(ten).toHaveLength(11)
    expect(ten[5]).toEqual([500, 60, 120])
  })

  it('defaults to 120 fps', () => {
    const events = makeEvents({
      pointer: [
        [0, 0, 0],
        [1000, 1, 1]
      ]
    })
    expect(smoothPointerPath(events, 0)).toHaveLength(121)
  })

  it('appends the last sample when it is off the grid', () => {
    const events = makeEvents({
      pointer: [
        [0, 0, 0],
        [1005, 100, 0]
      ]
    })
    const path = smoothPointerPath(events, 0, 100)
    expect(path).toHaveLength(102)
    expect(path[100][0]).toBe(1000)
    expect(path[100][1]).toBeCloseTo(1000 / 10.05)
    expect(path[100][2]).toBe(0)
    expect(path[101]).toEqual([1005, 100, 0])
  })

  it('holds the first sample before the log starts', () => {
    const events = makeEvents({
      pointer: [
        [500, 50, 60],
        [1000, 100, 60]
      ]
    })
    const path = smoothPointerPath(events, 0, 10)
    expect(path[0]).toEqual([0, 50, 60])
    expect(path[5]).toEqual([500, 50, 60])
  })

  it('handles a single sample', () => {
    const events = makeEvents({ pointer: [[0, 3, 4]] })
    expect(smoothPointerPath(events, 1)).toEqual([[0, 3, 4]])
  })

  it('leaves the resampled path untouched at strength 0', () => {
    const pointer: Array<[number, number, number]> = []
    for (let i = 0; i <= 120; i++) pointer.push([i * (1000 / 120), i % 2 ? 505 : 495, 300])
    const raw = smoothPointerPath(makeEvents({ pointer }), 0)
    raw.forEach(([, x]) => expect(Math.abs(x - 500)).toBeCloseTo(5))
  })

  /** Pointer log at 60 Hz jittering +-5 px around x=500 for 2 s. */
  function jitterEvents(): RecordingEvents {
    const pointer: Array<[number, number, number]> = []
    for (let i = 0; i <= 120; i++) pointer.push([i * (1000 / 60), i % 2 ? 505 : 495, 300])
    return makeEvents({ pointer })
  }

  function maxDeviation(path: Array<[number, number, number]>, fromMs: number): number {
    let max = 0
    for (const [t, x] of path) if (t >= fromMs) max = Math.max(max, Math.abs(x - 500))
    return max
  }

  it('removes jitter, more so with higher strength', () => {
    const events = jitterEvents()
    const raw = maxDeviation(smoothPointerPath(events, 0), 500)
    const mid = maxDeviation(smoothPointerPath(events, 0.5), 500)
    const heavy = maxDeviation(smoothPointerPath(events, 1), 500)
    expect(raw).toBeCloseTo(5)
    expect(mid).toBeLessThan(raw / 2)
    expect(heavy).toBeLessThan(mid)
    expect(heavy).toBeLessThan(1)
  })

  it('keeps timestamps and length, only changes positions', () => {
    const events = jitterEvents()
    const raw = smoothPointerPath(events, 0)
    const smooth = smoothPointerPath(events, 1)
    expect(smooth).toHaveLength(raw.length)
    smooth.forEach((s, i) => {
      expect(s[0]).toBe(raw[i][0])
      expect(s[2]).toBeCloseTo(300)
    })
  })

  it('still tracks a fast move at full strength', () => {
    const events = makeEvents({
      pointer: [
        [0, 0, 0],
        [1000, 0, 0],
        [1008, 1000, 0],
        [2000, 1000, 0]
      ]
    })
    const path = smoothPointerPath(events, 1)
    // Filtering both ways centres the move on the jump rather than trailing it.
    // The price is a little anticipation: 50 ms ahead it has moved under one
    // pixel of a thousand, which is a far better trade than the quarter second
    // of lag it replaces.
    expect(smoothedPointerAt(path, 0.95)?.x).toBeLessThan(1)
    const atJump = smoothedPointerAt(path, 1.0)
    expect(atJump?.x).toBeGreaterThan(100)
    expect(atJump?.x).toBeLessThan(900)
    // Arrived 20 ms later, instead of catching up over the next quarter second.
    expect(smoothedPointerAt(path, 1.02)?.x).toBeGreaterThan(900)
    expect(smoothedPointerAt(path, 1.25)?.x).toBeLessThanOrEqual(1000)
  })

  it('never overshoots a monotone move', () => {
    const events = makeEvents({
      pointer: [
        [0, 0, 0],
        [500, 800, 0],
        [1500, 800, 0]
      ]
    })
    const path = smoothPointerPath(events, 0.8)
    for (let i = 1; i < path.length; i++) {
      expect(path[i][1]).toBeGreaterThanOrEqual(path[i - 1][1] - 1e-9)
      expect(path[i][1]).toBeLessThanOrEqual(800 + 1e-9)
    }
  })

  it('clamps strength into 0..1', () => {
    const events = jitterEvents()
    expect(smoothPointerPath(events, -3)).toEqual(smoothPointerPath(events, 0))
    expect(smoothPointerPath(events, 7)).toEqual(smoothPointerPath(events, 1))
  })
})

describe('smoothedPointerAt', () => {
  const path: Array<[number, number, number]> = [
    [0, 0, 0],
    [100, 10, 20],
    [200, 30, 40]
  ]

  it('returns null for an empty path', () => {
    expect(smoothedPointerAt([], 1)).toBeNull()
  })

  it('interpolates and clamps at the ends', () => {
    expect(smoothedPointerAt(path, -1)).toEqual({ x: 0, y: 0 })
    expect(smoothedPointerAt(path, 0.05)).toEqual({ x: 5, y: 10 })
    expect(smoothedPointerAt(path, 0.15)).toEqual({ x: 20, y: 30 })
    expect(smoothedPointerAt(path, 5)).toEqual({ x: 30, y: 40 })
  })

  it('agrees with pointerAt for the same samples', () => {
    const events = makeEvents({ pointer: path })
    for (const t of [0, 0.03, 0.1, 0.17, 0.2, 1]) {
      expect(smoothedPointerAt(path, t)).toEqual(pointerAt(events, t))
    }
  })
})

describe('ripplesAt', () => {
  const events = makeEvents({
    clicks: [
      { t: 1000, x: 10, y: 20, button: 'left', down: true },
      { t: 1100, x: 10, y: 20, button: 'left', down: false },
      { t: 1300, x: 50, y: 60, button: 'right', down: true }
    ]
  })

  it('returns nothing before any click', () => {
    expect(ripplesAt(events, 0.9)).toEqual([])
  })

  it('returns a ripple with its age right after mousedown', () => {
    const r = ripplesAt(events, 1.2)
    expect(r).toHaveLength(1)
    expect(r[0].x).toBe(10)
    expect(r[0].y).toBe(20)
    expect(r[0].button).toBe('left')
    expect(r[0].age).toBeCloseTo(0.2)
  })

  it('includes age 0 exactly', () => {
    expect(ripplesAt(events, 1.0)).toHaveLength(1)
    expect(ripplesAt(events, 1.0)[0].age).toBe(0)
  })

  it('ignores mouseup and overlaps ripples from several clicks', () => {
    const r = ripplesAt(events, 1.4)
    expect(r).toHaveLength(2)
    expect(r[0].age).toBeCloseTo(0.4)
    expect(r[1].age).toBeCloseTo(0.1)
    expect(r[1].button).toBe('right')
  })

  it('expires ripples at lifeSec (exclusive)', () => {
    const r = ripplesAt(events, 1.5)
    expect(r).toHaveLength(1)
    expect(r[0].button).toBe('right')
    expect(ripplesAt(events, 1.8)).toEqual([])
  })

  it('honours a custom lifeSec', () => {
    expect(ripplesAt(events, 1.5, 1)).toHaveLength(2)
    expect(ripplesAt(events, 1.5, 0.1)).toEqual([])
  })
})

describe('smoothPointerPath is zero-phase', () => {
  /** A steady left-to-right move: 600 px/s for two seconds, sampled every 10 ms. */
  function ramp(): RecordingEvents {
    const pointer: Array<[number, number, number]> = []
    for (let t = 0; t <= 2000; t += 10) pointer.push([t, (t / 1000) * 600, 100])
    return makeEvents({ pointer })
  }

  it('does not delay a steady move, however hard it smooths', () => {
    for (const strength of [0.3, 0.6, 0.85, 1]) {
      const path = smoothPointerPath(ramp(), strength, 100)
      const mid = path.find((p) => p[0] === 1000)
      expect(mid).toBeDefined()
      // The true position at t=1000 ms is x=600. A forward-only filter trails it
      // by tens of pixels at these strengths.
      expect(Math.abs((mid as [number, number, number])[1] - 600)).toBeLessThan(5)
    }
  })

  it('still removes jitter', () => {
    const pointer: Array<[number, number, number]> = []
    for (let i = 0; i <= 200; i++) {
      const t = i * 10
      pointer.push([t, (t / 1000) * 600 + (i % 2 === 0 ? 12 : -12), 100])
    }
    const events = makeEvents({ pointer })
    const raw = smoothPointerPath(events, 0, 100)
    const smooth = smoothPointerPath(events, 0.8, 100)
    const wobble = (path: Array<[number, number, number]>): number =>
      path.reduce((sum, [t, x]) => sum + Math.abs(x - (t / 1000) * 600), 0) / path.length
    expect(wobble(smooth)).toBeLessThan(wobble(raw) / 2)
  })

  it('keeps the drawn pointer on the click, which is what made ripples look early or late', () => {
    const events = ramp()
    // Where the pointer truly was at each of these moments.
    for (const t of [400, 900, 1500]) {
      const path = smoothPointerPath(events, 0.85, 100)
      const at = path.find((p) => p[0] === t) as [number, number, number]
      expect(Math.abs(at[1] - (t / 1000) * 600)).toBeLessThan(5)
    }
  })

  it('leaves a path of one sample alone', () => {
    const events = makeEvents({ pointer: [[0, 5, 6]] })
    expect(smoothPointerPath(events, 1, 100)).toEqual([[0, 5, 6]])
  })
})
