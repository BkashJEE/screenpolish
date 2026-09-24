import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT, type Project, type ZoomSegment } from '../../shared/types'
import {
  MIN_SEGMENT_LENGTH,
  addManualSegment,
  clampFocus,
  clampSegment,
  createManualSegment,
  hitTestScrub,
  trimHandleHit,
  newSegmentId,
  removeSegment,
  restoreAutoSegments,
  segmentAt,
  shiftSegment,
  updateSegment
} from './segments'

const seg = (over: Partial<ZoomSegment>): ZoomSegment => ({
  id: 'a1',
  start: 2,
  end: 4,
  x: 100,
  y: 100,
  scale: 2,
  source: 'auto',
  ...over
})

const project = (over: Partial<Project['zoom']> = {}): Project => ({
  ...DEFAULT_PROJECT,
  zoom: { ...DEFAULT_PROJECT.zoom, ...over }
})

describe('segmentAt', () => {
  it('finds the segment containing t, start inclusive, end exclusive', () => {
    const list = [seg({ id: 'a', start: 1, end: 3 }), seg({ id: 'b', start: 5, end: 6 })]
    expect(segmentAt(list, 1)?.id).toBe('a')
    expect(segmentAt(list, 2.9)?.id).toBe('a')
    expect(segmentAt(list, 3)).toBeNull()
    expect(segmentAt(list, 5.5)?.id).toBe('b')
  })
})

describe('hitTestScrub', () => {
  const base = { width: 1000, duration: 10, trim: { start: 1, end: 9 }, segments: [seg({ id: 's', start: 4, end: 6 })] }

  it('prefers trim handles', () => {
    expect(hitTestScrub({ ...base, x: 100 })).toEqual({ kind: 'trim-start' })
    expect(hitTestScrub({ ...base, x: 904 })).toEqual({ kind: 'trim-end' })
  })
  it('ignores trim handles when told to', () => {
    const hit = hitTestScrub({ ...base, x: 100, includeTrim: false })
    expect(hit.kind).toBe('empty')
  })
  it('detects segment edges before bodies', () => {
    expect(hitTestScrub({ ...base, x: 402 })).toMatchObject({ kind: 'segment-start' })
    expect(hitTestScrub({ ...base, x: 598 })).toMatchObject({ kind: 'segment-end' })
    expect(hitTestScrub({ ...base, x: 500 })).toMatchObject({ kind: 'segment', segment: { id: 's' } })
  })
  it('returns the time on empty space', () => {
    expect(hitTestScrub({ ...base, x: 250 })).toEqual({ kind: 'empty', t: 2.5 })
  })
  it('handles degenerate inputs', () => {
    expect(hitTestScrub({ ...base, x: 10, duration: 0 })).toEqual({ kind: 'empty', t: 0 })
    expect(hitTestScrub({ ...base, x: 10, width: 0 })).toEqual({ kind: 'empty', t: 0 })
  })
  it('respects a custom handle tolerance', () => {
    expect(hitTestScrub({ ...base, x: 112, handlePx: 2 }).kind).toBe('empty')
    expect(hitTestScrub({ ...base, x: 112, handlePx: 15 }).kind).toBe('trim-start')
  })
})

describe('clampSegment', () => {
  it('keeps a minimum length and stays inside the recording', () => {
    const c = clampSegment(seg({ start: 9.9, end: 20 }), 10)
    expect(c.end).toBe(10)
    expect(c.start).toBeCloseTo(10 - MIN_SEGMENT_LENGTH)
    const tiny = clampSegment(seg({ start: 2, end: 2.05 }), 10)
    expect(tiny.end - tiny.start).toBeCloseTo(MIN_SEGMENT_LENGTH)
  })
})

describe('clampFocus', () => {
  const region = { width: 1920, height: 1080 }

  it('keeps focus coordinates inside the captured region', () => {
    expect(clampFocus({ x: -10, y: 2000 }, region)).toEqual({ x: 0, y: 1080 })
    expect(clampFocus({ x: 1920, y: 0 }, region)).toEqual({ x: 1920, y: 0 })
  })

  it('falls back to the region centre for non-finite coordinates', () => {
    expect(clampFocus({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, region)).toEqual({ x: 960, y: 540 })
    expect(clampFocus({ x: Number.NEGATIVE_INFINITY, y: Number.NaN }, region)).toEqual({ x: 960, y: 540 })
  })
})

describe('shiftSegment', () => {
  it('moves start and end together without changing length', () => {
    const moved = shiftSegment(seg({ start: 2, end: 4.5 }), 5.25, 10)
    expect(moved).toEqual({ start: 5.25, end: 7.75 })
    expect(moved.end - moved.start).toBe(2.5)
  })

  it('clamps at the recording start and end while preserving length', () => {
    expect(shiftSegment(seg({ start: 2, end: 4 }), -3, 10)).toEqual({ start: 0, end: 2 })
    expect(shiftSegment(seg({ start: 2, end: 4 }), 99, 10)).toEqual({ start: 8, end: 10 })
  })
})

describe('createManualSegment', () => {
  const region = { width: 1920, height: 1080 }
  it('creates a 2.5 s manual segment at t with the pointer focus', () => {
    const s = createManualSegment({ t: 3, duration: 20, focus: { x: 10, y: 20 }, region, scale: 2.5 })
    expect(s).toMatchObject({ start: 3, end: 5.5, x: 10, y: 20, scale: 2.5, source: 'manual' })
    expect(s.id).toMatch(/^m-/)
  })
  it('falls back to the region centre without a pointer', () => {
    const s = createManualSegment({ t: 0, duration: 20, focus: null, region, scale: 2 })
    expect(s).toMatchObject({ x: 960, y: 540 })
  })
  it('pulls back from the end so the full length fits', () => {
    const s = createManualSegment({ t: 19, duration: 20, focus: null, region, scale: 2 })
    expect(s.end).toBe(20)
    expect(s.start).toBeCloseTo(17.5)
  })
  it('never produces a negative start on a very short recording', () => {
    const s = createManualSegment({ t: 0.5, duration: 1, focus: null, region, scale: 2 })
    expect(s.start).toBe(0)
    expect(s.end).toBe(1)
  })
})

describe('add / remove / update', () => {
  it('adds manual segments sorted by start without mutating', () => {
    const p = project({ manual: [seg({ id: 'm1', start: 5, end: 7, source: 'manual' })] })
    const next = addManualSegment(p, seg({ id: 'm0', start: 1, end: 2, source: 'manual' }))
    expect(next.zoom.manual.map((s) => s.id)).toEqual(['m0', 'm1'])
    expect(p.zoom.manual).toHaveLength(1)
  })
  it('removes manual segments from the list and auto ones via removedAuto', () => {
    const p = project({ manual: [seg({ id: 'm1', source: 'manual' })] })
    expect(removeSegment(p, seg({ id: 'm1', source: 'manual' })).zoom.manual).toEqual([])
    const r = removeSegment(p, seg({ id: 'auto-3', source: 'auto' }))
    expect(r.zoom.removedAuto).toEqual(['auto-3'])
    expect(r.zoom.manual).toHaveLength(1)
    // idempotent
    expect(removeSegment(r, seg({ id: 'auto-3', source: 'auto' }))).toBe(r)
  })
  it('updates a manual segment in place', () => {
    const p = project({ manual: [seg({ id: 'm1', start: 2, end: 4, source: 'manual' })] })
    const { project: next, segment } = updateSegment(p, p.zoom.manual[0], { end: 6, scale: 3 }, 10)
    expect(segment).toMatchObject({ id: 'm1', start: 2, end: 6, scale: 3 })
    expect(next.zoom.manual[0]).toBe(segment)
  })
  it('converts an auto segment into a manual copy on edit', () => {
    const auto = seg({ id: 'auto-1', start: 2, end: 4 })
    const { project: next, segment } = updateSegment(project(), auto, { scale: 3 }, 10)
    expect(segment.source).toBe('manual')
    expect(segment.id).not.toBe('auto-1')
    expect(segment.scale).toBe(3)
    expect(next.zoom.removedAuto).toEqual(['auto-1'])
    expect(next.zoom.manual).toHaveLength(1)
  })
  it('adds a stale manual selection back instead of dropping the edit', () => {
    const { project: next } = updateSegment(project(), seg({ id: 'gone', source: 'manual' }), { end: 5 }, 10)
    expect(next.zoom.manual).toHaveLength(1)
  })
  it('restores removed auto segments', () => {
    const p = project({ removedAuto: ['a', 'b'] })
    expect(restoreAutoSegments(p).zoom.removedAuto).toEqual([])
    const untouched = project()
    expect(restoreAutoSegments(untouched)).toBe(untouched)
  })
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newSegmentId()))
    expect(ids.size).toBe(200)
  })
})

describe('trimHandleHit', () => {
  // The scrub bar's handles run from y 22 to y 124: zoom lane, overlay lane and clip lane.
  const base = { width: 1000, duration: 100, trim: { start: 10, end: 90 }, top: 22, bottom: 124, handlePx: 7 }

  it('grabs a handle anywhere along its height, including the grip mid-way down', () => {
    for (const y of [22, 40, 73, 100, 124]) {
      expect(trimHandleHit({ ...base, x: 100, y })).toBe('trim-start')
      expect(trimHandleHit({ ...base, x: 900, y })).toBe('trim-end')
    }
  })

  it('has the width of the drawn handle and no more', () => {
    expect(trimHandleHit({ ...base, x: 107, y: 73 })).toBe('trim-start')
    expect(trimHandleHit({ ...base, x: 108, y: 73 })).toBeNull()
    expect(trimHandleHit({ ...base, x: 500, y: 73 })).toBeNull()
  })

  it('leaves the ruler and anything below the lanes alone', () => {
    expect(trimHandleHit({ ...base, x: 100, y: 10 })).toBeNull()
    expect(trimHandleHit({ ...base, x: 100, y: 130 })).toBeNull()
  })

  it('grabs the handles at the very ends of an untrimmed take', () => {
    const untrimmed = { ...base, trim: { start: 0, end: 100 } }
    expect(trimHandleHit({ ...untrimmed, x: 2, y: 73 })).toBe('trim-start')
    expect(trimHandleHit({ ...untrimmed, x: 998, y: 73 })).toBe('trim-end')
  })

  it('takes the nearer handle when a short trim puts both under the pointer', () => {
    const short = { ...base, trim: { start: 50, end: 50.8 } }
    expect(trimHandleHit({ ...short, x: 501, y: 73 })).toBe('trim-start')
    expect(trimHandleHit({ ...short, x: 507, y: 73 })).toBe('trim-end')
  })

  it('does nothing before the take has a duration or a width', () => {
    expect(trimHandleHit({ ...base, duration: 0, x: 100, y: 73 })).toBeNull()
    expect(trimHandleHit({ ...base, width: 0, x: 100, y: 73 })).toBeNull()
  })
})
