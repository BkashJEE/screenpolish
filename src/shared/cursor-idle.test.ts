import { describe, expect, it } from 'vitest'
import { IDLE_FADE_SEC, cursorAlphaAt, idleCursorAlpha, idleSecondsAt } from './cursor-idle'
import type { PointerSample } from './pointer'

/** Moves to 3 s, then parked at the same spot until 20 s. */
const path: PointerSample[] = [
  [0, 100, 100],
  [1000, 200, 150],
  [2000, 300, 200],
  [3000, 400, 260],
  ...Array.from({ length: 17 }, (_, i): PointerSample => [4000 + i * 1000, 400.4, 260.3])
]

describe('idleSecondsAt', () => {
  it('is zero while the pointer is moving', () => {
    expect(idleSecondsAt(path, [], 3)).toBeCloseTo(0)
  })

  it('counts from the last real movement, ignoring sub-pixel jitter', () => {
    expect(idleSecondsAt(path, [], 10)).toBeCloseTo(7)
  })

  it('treats a click as activity even with the pointer still', () => {
    expect(idleSecondsAt(path, [{ t: 9000, x: 400, y: 260, button: 'left', down: true }], 10)).toBeCloseTo(1)
  })

  it('ignores clicks and samples from after the moment asked about', () => {
    expect(idleSecondsAt(path, [{ t: 15000, x: 1, y: 1, button: 'left', down: true }], 10)).toBeCloseTo(7)
  })
})

describe('idleCursorAlpha', () => {
  it('is fully visible when the feature is off', () => {
    expect(idleCursorAlpha(99, 0)).toBe(1)
    expect(idleCursorAlpha(99, -1)).toBe(1)
  })

  it('holds, then fades to nothing', () => {
    expect(idleCursorAlpha(1.9, 2)).toBe(1)
    expect(idleCursorAlpha(2 + IDLE_FADE_SEC / 2, 2)).toBeCloseTo(0.5)
    expect(idleCursorAlpha(2 + IDLE_FADE_SEC, 2)).toBe(0)
    expect(idleCursorAlpha(60, 2)).toBe(0)
  })
})

describe('cursorAlphaAt', () => {
  it('returns 1 for every old project, which has no setting', () => {
    expect(cursorAlphaAt(path, [], 12, undefined)).toBe(1)
  })

  it('hides a long-parked pointer and brings it back on a click', () => {
    expect(cursorAlphaAt(path, [], 12, 2)).toBe(0)
    expect(cursorAlphaAt(path, [{ t: 11800, x: 400, y: 260, button: 'left', down: true }], 12, 2)).toBe(1)
  })
})
