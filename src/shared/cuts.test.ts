import { describe, expect, it } from 'vitest'
import { canSplitAt, clipAt, clipsFrom, joinAt, keptDuration, normalizeCuts, removeClip, restoreClip, skipCuts, splitAt, type Cut } from './cuts'
import { sourceTimeAt, speedSpans } from './speed'

const trim = { start: 0, end: 10 }
const cut = (start: number, end: number): Cut => ({ id: `c${start}`, start, end })

describe('slicing', () => {
  it('splits at the playhead and refuses slivers, edges and duplicates', () => {
    const splits = splitAt(4, [], trim)
    expect(splits).toEqual([4])
    expect(splitAt(4.05, splits, trim)).toEqual([4])
    expect(splitAt(0, splits, trim)).toEqual([4])
    expect(splitAt(10, splits, trim)).toEqual([4])
    expect(splitAt(9.9, splits, trim)).toEqual([4])
    expect(canSplitAt(7, splits, trim)).toBe(true)
    expect(canSplitAt(4, splits, trim)).toBe(false)
  })

  it('lists clips between boundaries and marks the removed ones', () => {
    const clips = clipsFrom(trim, [3, 6], [cut(3, 6)])
    expect(clips.map((c) => [c.start, c.end, c.removed])).toEqual([
      [0, 3, false],
      [3, 6, true],
      [6, 10, false]
    ])
    expect(clipAt(4, clips)?.start).toBe(3)
    expect(clipAt(10, clips)?.start).toBe(6)
    expect(clipAt(11, clips)).toBeNull()
  })

  it('ignores splits outside a trim that was tightened later', () => {
    expect(clipsFrom({ start: 2, end: 8 }, [1, 5, 9], []).map((c) => [c.start, c.end])).toEqual([
      [2, 5],
      [5, 8]
    ])
  })

  it('merges neighbouring removals and restores one clip out of a merged cut', () => {
    const merged = removeClip({ start: 6, end: 10 }, removeClip({ start: 3, end: 6 }, []))
    expect(merged.map((c) => [c.start, c.end])).toEqual([[3, 10]])
    expect(restoreClip({ start: 3, end: 6 }, merged).map((c) => [c.start, c.end])).toEqual([[6, 10]])
    expect(restoreClip({ start: 5, end: 7 }, merged).map((c) => [c.start, c.end])).toEqual([
      [3, 5],
      [7, 10]
    ])
  })

  it('joins the nearest split within tolerance only', () => {
    expect(joinAt(3.05, [3, 6], 0.1)).toEqual([6])
    expect(joinAt(4.5, [3, 6], 0.1)).toEqual([3, 6])
  })

  it('drops invalid cuts and skips through back-to-back removals', () => {
    expect(normalizeCuts([cut(5, 4), { id: '', start: NaN, end: 2 }, cut(1, 2)])).toHaveLength(1)
    const cuts = normalizeCuts([cut(2, 3), cut(3, 5)])
    expect(skipCuts(2.5, cuts)).toBe(5)
    expect(skipCuts(1, cuts)).toBe(1)
    expect(keptDuration(0, 10, cuts)).toBe(7)
  })
})

describe('speedSpans with cuts', () => {
  it('leaves removed ranges out of the output timeline', () => {
    const spans = speedSpans(0, 10, [], [cut(3, 6)])
    expect(spans.map((s) => [s.start, s.end, s.outputStart, s.outputEnd])).toEqual([
      [0, 3, 0, 3],
      [6, 10, 3, 7]
    ])
    expect(sourceTimeAt(2.9, spans)).toBeCloseTo(2.9)
    expect(sourceTimeAt(3.5, spans)).toBeCloseTo(6.5)
  })

  it('composes cuts with speed regions that cross them', () => {
    const spans = speedSpans(0, 10, [{ id: 's', start: 2, end: 8, rate: 2 }], [cut(4, 6)])
    expect(spans.at(-1)?.outputEnd).toBeCloseTo(2 + 1 + 1 + 2)
    expect(spans.every((s) => s.end <= 4 || s.start >= 6)).toBe(true)
  })

  it('produces no output when everything is removed', () => {
    expect(speedSpans(0, 10, [], [cut(0, 10)])).toEqual([])
  })
})
