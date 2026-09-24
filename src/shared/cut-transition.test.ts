import { describe, expect, it } from 'vitest'
import {
  cutJoins,
  cutTransitionLabel,
  cutTransitionActive,
  heldOpacity,
  HELD_PEAK,
  MAX_CUT_TRANSITION_SEC,
  MIN_CUT_TRANSITION_SEC,
  normalizeCutTransition,
  transitionBlurPx,
  transitionProgress
} from './cut-transition'
import { speedSpans } from './speed'

describe('normalizeCutTransition', () => {
  it('falls back to a hard cut for anything unrecognised', () => {
    expect(normalizeCutTransition(undefined)).toEqual({ style: 'none', durationSec: 0.25 })
    expect(normalizeCutTransition({ style: 'wipe' }).style).toBe('none')
    expect(normalizeCutTransition({ style: 'blur' }).style).toBe('blur')
  })

  it('bounds the duration', () => {
    expect(normalizeCutTransition({ style: 'dissolve', durationSec: 0 }).durationSec).toBe(MIN_CUT_TRANSITION_SEC)
    expect(normalizeCutTransition({ style: 'dissolve', durationSec: 9 }).durationSec).toBe(MAX_CUT_TRANSITION_SEC)
    expect(normalizeCutTransition({ style: 'dissolve', durationSec: NaN }).durationSec).toBe(0.25)
  })
})

describe('cutJoins', () => {
  const cut = (start: number, end: number) => ({ id: `c${start}`, start, end })

  it('reports the output time where a removed clip joined two pieces', () => {
    // 0..10 with 3..5 removed: output runs 0..8, the join lands at output 3.
    const joins = cutJoins(speedSpans(0, 10, [], [cut(3, 5)]))
    expect(joins).toEqual([3])
  })

  it('ignores a cut at the very start or the very end', () => {
    expect(cutJoins(speedSpans(0, 10, [], [cut(0, 2)]))).toEqual([])
    expect(cutJoins(speedSpans(0, 10, [], [cut(8, 10)]))).toEqual([])
  })

  it('reports one join per removed clip', () => {
    expect(cutJoins(speedSpans(0, 12, [], [cut(2, 3), cut(6, 8)]))).toEqual([2, 5])
  })

  it('does not fire where a speed region changes rate without removing anything', () => {
    const spans = speedSpans(0, 10, [{ id: 'r', start: 4, end: 6, rate: 2 }], [])
    expect(spans.length).toBeGreaterThan(1)
    expect(cutJoins(spans)).toEqual([])
  })

  it('places the join in output time, not source time, after a speed change', () => {
    // 0..4 at 1x is 4s of output; 4..6 at 2x is 1s; 6..7 removed.
    const joins = cutJoins(speedSpans(0, 10, [{ id: 'r', start: 4, end: 6, rate: 2 }], [cut(6, 7)]))
    expect(joins).toEqual([5])
  })
})

describe('transitionProgress', () => {
  const t = { style: 'dissolve' as const, durationSec: 0.25 }

  it('is null with no transition, and for times the joins do not cover', () => {
    expect(transitionProgress(3, [3], { style: 'none', durationSec: 0.25 })).toBeNull()
    expect(transitionProgress(2.9, [3], t)).toBeNull()
    expect(transitionProgress(3.25, [3], t)).toBeNull()
  })

  it('runs 0 at the join to just under 1 at its end', () => {
    expect(transitionProgress(3, [3], t)).toBe(0)
    expect(transitionProgress(3.125, [3], t)).toBeCloseTo(0.5, 6)
    expect(transitionProgress(3.2499, [3], t)).toBeCloseTo(1, 3)
  })

  it('hands over to the nearer join when two are closer than the duration', () => {
    expect(transitionProgress(3.1, [3, 3.05], t)).toBeCloseTo(0.2, 6)
  })
})

describe('heldOpacity', () => {
  it('starts just under full cover and reaches zero', () => {
    expect(heldOpacity(0)).toBe(HELD_PEAK)
    expect(heldOpacity(1)).toBe(0)
  })

  it('falls monotonically', () => {
    let previous = Infinity
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const value = heldOpacity(p)
      expect(value).toBeLessThanOrEqual(previous + 1e-9)
      previous = value
    }
  })

  it('clamps outside 0..1', () => {
    expect(heldOpacity(-1)).toBe(HELD_PEAK)
    expect(heldOpacity(2)).toBe(0)
  })
})

describe('transitionBlurPx', () => {
  it('peaks at the join and clears by the end', () => {
    expect(transitionBlurPx(0, 1000)).toBeCloseTo(16, 6)
    expect(transitionBlurPx(1, 1000)).toBe(0)
  })

  it('scales with the output so every size softens by the same amount', () => {
    expect(transitionBlurPx(0, 2000)).toBeCloseTo(2 * transitionBlurPx(0, 1000), 6)
  })
})

describe('cutTransitionActive', () => {
  it('is false for a hard cut or a zero duration', () => {
    expect(cutTransitionActive(undefined)).toBe(false)
    expect(cutTransitionActive({ style: 'none', durationSec: 0.25 })).toBe(false)
    expect(cutTransitionActive({ style: 'dissolve', durationSec: 0 })).toBe(false)
    expect(cutTransitionActive({ style: 'dissolve', durationSec: 0.25 })).toBe(true)
  })
})

describe('cutTransitionLabel', () => {
  it('names every style', () => {
    expect(cutTransitionLabel('none')).toBe('Hard cut')
    expect(cutTransitionLabel('dissolve')).toBe('Dissolve')
    expect(cutTransitionLabel('blur')).toBe('Blur dissolve')
  })
})
