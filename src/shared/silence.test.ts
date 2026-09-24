import { describe, expect, it } from 'vitest'
import { DEFAULT_SILENCE, FLOOR_DB, LevelMeter, SILENCE_CUT_PREFIX, findSilences, removeSilences, restoreSilences, rmsDb, silenceSummary } from './silence'
import { clipsFrom, keptDuration } from './cuts'
import { cutJoins } from './cut-transition'
import { speedSpans } from './speed'

const W = 0.02
/** Levels for a take described as [seconds, dB] pieces. */
function levels(...pieces: Array<[number, number]>): number[] {
  const out: number[] = []
  for (const [sec, db] of pieces) for (let i = 0; i < Math.round(sec / W); i++) out.push(db)
  return out
}
const SPEECH = -18
const QUIET = -60
const opts = { ...DEFAULT_SILENCE }

describe('rmsDb', () => {
  it('reads a full-scale square wave as 0 dB and digital silence as the floor', () => {
    expect(rmsDb([1, -1, 1, -1])).toBeCloseTo(0, 6)
    expect(rmsDb([0, 0, 0])).toBe(FLOOR_DB)
    expect(rmsDb([])).toBe(FLOOR_DB)
  })

  it('reads a half-scale signal about 6 dB down', () => {
    expect(rmsDb([0.5, -0.5])).toBeCloseTo(-6.02, 2)
  })
})

describe('findSilences', () => {
  it('finds a pause between two stretches of speech, padded on both sides', () => {
    const l = levels([2, SPEECH], [2, QUIET], [2, SPEECH])
    const found = findSilences(l, W, { start: 0, end: 6 }, opts)
    expect(found).toHaveLength(1)
    expect(found[0].start).toBeCloseTo(2 + opts.padSec, 6)
    expect(found[0].end).toBeCloseTo(4 - opts.padSec, 6)
  })

  it('ignores a pause shorter than the minimum', () => {
    const l = levels([2, SPEECH], [0.5, QUIET], [2, SPEECH])
    expect(findSilences(l, W, { start: 0, end: 4.5 }, opts)).toEqual([])
  })

  it('does not let a short blip split a silence', () => {
    const l = levels([2, SPEECH], [1, QUIET], [0.06, SPEECH], [1, QUIET], [2, SPEECH])
    const found = findSilences(l, W, { start: 0, end: 6.06 }, opts)
    expect(found).toHaveLength(1)
    expect(found[0].end - found[0].start).toBeGreaterThan(1.6)
  })

  it('lets a longer sound split a silence into two', () => {
    const l = levels([2, SPEECH], [1, QUIET], [0.5, SPEECH], [1, QUIET], [2, SPEECH])
    expect(findSilences(l, W, { start: 0, end: 6.5 }, opts)).toHaveLength(2)
  })

  it('removes silence at the very start and end without padding the trim edges', () => {
    const l = levels([1.5, QUIET], [2, SPEECH], [1.5, QUIET])
    const found = findSilences(l, W, { start: 0, end: 5 }, opts)
    expect(found[0]).toEqual({ start: 0, end: 1.5 - opts.padSec })
    expect(found[1].start).toBeCloseTo(3.5 + opts.padSec, 6)
    expect(found[1].end).toBe(5)
  })

  it('only looks inside the trim', () => {
    const l = levels([2, QUIET], [2, SPEECH], [2, QUIET], [2, SPEECH])
    const found = findSilences(l, W, { start: 3, end: 8 }, opts)
    expect(found).toHaveLength(1)
    expect(found[0].start).toBeGreaterThanOrEqual(4)
  })

  it('treats a missing level as silence rather than sound', () => {
    const l = levels([2, SPEECH], [2, NaN], [2, SPEECH])
    expect(findSilences(l, W, { start: 0, end: 6 }, opts)).toHaveLength(1)
  })

  it('a lower threshold keeps quiet talking', () => {
    const l = levels([2, SPEECH], [2, -48], [2, SPEECH])
    expect(findSilences(l, W, { start: 0, end: 6 }, opts)).toHaveLength(1)
    expect(findSilences(l, W, { start: 0, end: 6 }, { ...opts, thresholdDb: -52 })).toEqual([])
  })
})

describe('removeSilences and restoreSilences', () => {
  const trim = { start: 0, end: 10 }
  const silences = [{ start: 2, end: 4 }, { start: 6, end: 7 }]

  it('cuts each silence as its own clip, so playback and export skip it', () => {
    const { cuts, splits } = removeSilences(silences, [], [], trim)
    expect(cuts.map((c) => [c.start, c.end])).toEqual([[2, 4], [6, 7]])
    expect(cuts.every((c) => c.id.startsWith(SILENCE_CUT_PREFIX))).toBe(true)
    expect(keptDuration(0, 10, cuts)).toBeCloseTo(7, 6)
    const removed = clipsFrom(trim, splits, cuts).filter((c) => c.removed)
    expect(removed.map((c) => [c.start, c.end])).toEqual([[2, 4], [6, 7]])
    // Each removal leaves a join for the cut transition to cover.
    expect(cutJoins(speedSpans(0, 10, [], cuts))).toHaveLength(2)
  })

  it('keeps the user\'s own cuts, and puts back only the silences', () => {
    const own = [{ id: 'cut-8500-9000', start: 8.5, end: 9 }]
    const removed = removeSilences(silences, own, [8.5, 9], trim)
    expect(silenceSummary(removed.cuts)).toEqual({ count: 2, seconds: 3 })
    const back = restoreSilences(removed.cuts, removed.splits)
    expect(back.cuts).toEqual(own)
    expect(back.splits).toEqual([8.5, 9])
    expect(silenceSummary(back.cuts)).toEqual({ count: 0, seconds: 0 })
  })

  it('running it twice does not double anything', () => {
    const once = removeSilences(silences, [], [], trim)
    const twice = removeSilences(silences, once.cuts, once.splits, trim)
    expect(twice.cuts).toEqual(once.cuts)
    expect(twice.splits).toEqual(once.splits)
  })
})

describe('LevelMeter', () => {
  it('turns decoded audio into per-window loudness, across channels', () => {
    const rate = 1000
    const meter = new LevelMeter(0.06, 0.02)
    // 20 ms of full-scale stereo, then 20 ms of silence, then nothing at all.
    const loud = new Float32Array(20 * 2).map((_, i) => (i % 4 < 2 ? 1 : -1))
    meter.add(loud, 20, 2, rate, 0)
    meter.add(new Float32Array(20 * 2), 20, 2, rate, 0.02)
    const l = meter.levels()
    expect(l).toHaveLength(3)
    expect(l[0]).toBeCloseTo(0, 5)
    expect(l[1]).toBe(FLOOR_DB)
    expect(l[2]).toBe(FLOOR_DB)
  })

  it('places a sample by its timestamp and ignores audio past the end', () => {
    const meter = new LevelMeter(0.04, 0.02)
    meter.add(new Float32Array(20).fill(0.5), 20, 1, 1000, 0.02)
    meter.add(new Float32Array(20).fill(1), 20, 1, 1000, 5)
    const l = meter.levels()
    expect(l[0]).toBe(FLOOR_DB)
    expect(l[1]).toBeCloseTo(rmsDb([0.5]), 5)
  })
})
