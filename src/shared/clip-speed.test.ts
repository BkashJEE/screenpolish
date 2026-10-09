import { describe, expect, it } from 'vitest'
import { CLIP_SPEED_EASE, clipSpeed, setClipSpeed, speedSpans, type SpeedRegion } from './speed'

let n = 0
const id = () => `r${++n}`
const clip = { start: 4, end: 10 }

describe('setClipSpeed', () => {
  it('speeds up exactly the clip, with a short ramp at each end', () => {
    const out = setClipSpeed([], clip, 2, id)
    expect(out).toEqual([{ id: expect.any(String), start: 4, end: 10, rate: 2, ease: CLIP_SPEED_EASE }])
    expect(clipSpeed(out, clip)).toBe(2)
    // The take gets shorter by the time saved: 6 s at 2x, less a little for the ramps.
    const before = speedSpans(0, 20, []).at(-1)!.outputEnd
    const after = speedSpans(0, 20, out).at(-1)!.outputEnd
    expect(before - after).toBeGreaterThan(2.5)
    expect(before - after).toBeLessThan(3)
  })

  it('replaces the clip speed rather than stacking it', () => {
    const twice = setClipSpeed(setClipSpeed([], clip, 2, id), clip, 4, id)
    expect(twice).toHaveLength(1)
    expect(clipSpeed(twice, clip)).toBe(4)
  })

  it('goes back to normal at 1x', () => {
    expect(setClipSpeed(setClipSpeed([], clip, 2, id), clip, 1, id)).toEqual([])
  })

  it('leaves neighbouring clips alone, trimming a region that spilled over', () => {
    const wide: SpeedRegion[] = [{ id: 'w', start: 2, end: 12, rate: 3 }]
    const out = setClipSpeed(wide, clip, 0.5, id)
    expect(out.map((r) => [r.start, r.end, r.rate])).toEqual([[2, 4, 3], [4, 10, 0.5], [10, 12, 3]])
    const other: SpeedRegion = { id: 'o', start: 14, end: 16, rate: 2 }
    expect(setClipSpeed([other], clip, 2, id)).toContainEqual(other)
  })

  it('clamps to the speeds export supports', () => {
    expect(setClipSpeed([], clip, 10, id)[0]!.rate).toBe(4)
    expect(setClipSpeed([], clip, 0.1, id)[0]!.rate).toBe(0.25)
  })
})

describe('clipSpeed', () => {
  it('is 1 when untouched and null when the clip is only partly sped up', () => {
    expect(clipSpeed([], clip)).toBe(1)
    expect(clipSpeed([{ id: 'p', start: 6, end: 8, rate: 2 }], clip)).toBeNull()
  })
})
