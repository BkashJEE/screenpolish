import { describe, expect, it } from 'vitest'
import {
  canonicalTrimEnd,
  clamp,
  formatDurationShort,
  formatElapsed,
  formatTime,
  frameDuration,
  resolveTrim,
  snapToFrame,
  stepTime,
  timeToX,
  xToTime
} from './time'

describe('clamp', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
  it('returns lo when the range is inverted', () => {
    expect(clamp(2, 5, 1)).toBe(5)
  })
})

describe('formatTime', () => {
  it('formats sub-minute times with hundredths', () => {
    expect(formatTime(4.2)).toBe('0:04.20')
    expect(formatTime(0)).toBe('0:00.00')
  })
  it('formats minutes and hours', () => {
    expect(formatTime(62.5)).toBe('1:02.50')
    expect(formatTime(3723.4)).toBe('1:02:03.40')
  })
  it('drops the fraction on request', () => {
    expect(formatTime(62.5, { fraction: false })).toBe('1:02')
  })
  it('renders non-finite as a dash', () => {
    expect(formatTime(NaN)).toBe('--:--')
    expect(formatTime(Infinity)).toBe('--:--')
  })
  it('never goes negative', () => {
    expect(formatTime(-3)).toBe('0:00.00')
  })
})

describe('formatDurationShort', () => {
  it('handles seconds, minutes, hours and null', () => {
    expect(formatDurationShort(12.4)).toBe('12s')
    expect(formatDurationShort(64)).toBe('1m 04s')
    expect(formatDurationShort(3720)).toBe('1h 02m')
    expect(formatDurationShort(null)).toBe('--')
  })
})

describe('formatElapsed', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(723_000)).toBe('12:03')
    expect(formatElapsed(3_600_000 + 5_000)).toBe('1:00:05')
  })
})

describe('scrub math', () => {
  it('maps time to x and back', () => {
    expect(timeToX(5, 10, 200)).toBe(100)
    expect(xToTime(100, 10, 200)).toBe(5)
    expect(xToTime(-50, 10, 200)).toBe(0)
    expect(xToTime(500, 10, 200)).toBe(10)
  })
  it('is safe with zero duration or width', () => {
    expect(timeToX(5, 0, 200)).toBe(0)
    expect(xToTime(5, 10, 0)).toBe(0)
  })
  it('round-trips within float tolerance', () => {
    const d = 37.31
    const w = 913
    for (const t of [0, 1.5, 12.34, d]) {
      expect(xToTime(timeToX(t, d, w), d, w)).toBeCloseTo(t, 9)
    }
  })
})

describe('frames', () => {
  it('computes frame duration', () => {
    expect(frameDuration(30)).toBeCloseTo(1 / 30)
    expect(frameDuration(0)).toBeCloseTo(1 / 30)
  })
  it('snaps to frames', () => {
    expect(snapToFrame(1.01, 30)).toBeCloseTo(1)
    expect(snapToFrame(1.02, 30)).toBeCloseTo(1 + 1 / 30)
  })
  it('steps within a range', () => {
    expect(stepTime(1, 1, 0, 1.5)).toBe(1.5)
    expect(stepTime(0.2, -1, 0, 1.5)).toBe(0)
  })
})

describe('trim', () => {
  it('canonicalises the end to 0 at the duration', () => {
    expect(canonicalTrimEnd(10, 10)).toBe(0)
    expect(canonicalTrimEnd(9.9999, 10)).toBe(0)
    expect(canonicalTrimEnd(8, 10)).toBe(8)
    expect(canonicalTrimEnd(8, 0)).toBe(8)
  })
  it('resolves end=0 to the full duration and clamps start', () => {
    expect(resolveTrim({ start: 0, end: 0 }, 12)).toEqual({ start: 0, end: 12 })
    expect(resolveTrim({ start: 3, end: 8 }, 12)).toEqual({ start: 3, end: 8 })
    expect(resolveTrim({ start: 9, end: 8 }, 12)).toEqual({ start: 8, end: 8 })
    expect(resolveTrim({ start: 0, end: 40 }, 12)).toEqual({ start: 0, end: 12 })
  })
  it('tolerates an unknown duration', () => {
    expect(resolveTrim({ start: 0, end: 0 }, Infinity)).toEqual({ start: 0, end: 0 })
    expect(resolveTrim({ start: 1, end: 5 }, NaN)).toEqual({ start: 1, end: 5 })
  })
})
