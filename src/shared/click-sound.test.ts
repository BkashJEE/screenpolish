import { describe, expect, it } from 'vitest'
import { CLICK_SAMPLE_RATE, audibleClicks, clickRuns, clickSound, clickTimes, createClickPlaybackCursor, createPlaybackCursor, nextRateChange, type ClickSoundSettings } from './click-sound'
import type { RecordingEvents } from './types'

const on: ClickSoundSettings = { enabled: true, style: 'soft', volume: 1 }
const region = { x: 0, y: 0, width: 100, height: 100, scale: 1 }
const press = (t: number, down = true, x = 50, y = 50) => ({ t: t * 1000, x, y, button: 'left' as const, down })

describe('click sounds', () => {
  it('synthesises every style deterministically, peaking with headroom and ending silent', () => {
    for (const style of ['soft', 'mouse', 'pop', 'tick'] as const) {
      const a = clickSound(style)
      expect(a.length).toBeGreaterThan(0.04 * CLICK_SAMPLE_RATE)
      expect(a.length).toBeLessThan(0.1 * CLICK_SAMPLE_RATE)
      expect(Math.max(...Array.from(a, Math.abs))).toBeCloseTo(0.7, 5)
      expect(Math.abs(a[a.length - 1])).toBeLessThan(1e-3)
      expect(clickSound(style, 44100).length).toBe(Math.round(a.length * 44100 / 48000))
    }
    expect(clickSound('soft')).toBe(clickSound('soft'))
  })

  it('ignores releases and presses outside the captured area', () => {
    const events = { region, clicks: [press(0.1), press(0.11, false), press(0.2, true, -900, 50), press(0.3, true, 50, 100)] } as RecordingEvents
    expect(audibleClicks(events)).toEqual([0.1])
  })

  it('uses only audible presses inside the trim and outside removed clips', () => {
    const events = { region, clicks: [press(0.5), press(0.6, false), press(2), press(4.5), press(9), press(1), press(3, true, 500, 5)] } as RecordingEvents
    expect(clickTimes(events, { start: 0.8, end: 8 }, [{ id: 'c', start: 4, end: 5 }])).toEqual([1, 2])
  })

  it('mixes a fast double-click into one run and keeps separate clicks apart', () => {
    const runs = clickRuns([1, 1.03, 3], on)
    expect(runs.map((r) => r.start)).toEqual([1, 3])
    expect(Math.abs(runs[0].samples.length - (0.03 * CLICK_SAMPLE_RATE + clickSound('soft').length))).toBeLessThanOrEqual(1)
    expect(Math.max(...Array.from(runs[0].samples, Math.abs))).toBeLessThanOrEqual(1)
  })

  it('makes nothing when disabled or muted, and scales by volume', () => {
    expect(clickRuns([1], { ...on, enabled: false })).toEqual([])
    expect(clickRuns([1], { ...on, volume: 0 })).toEqual([])
    expect(Math.max(...Array.from(clickRuns([1], { ...on, volume: 0.5 })[0].samples, Math.abs))).toBeCloseTo(0.35, 5)
  })
})

describe('preview click cursor', () => {
  it('keeps clicks after a long playback frame and never repeats them', () => {
    const clock = createClickPlaybackCursor([1.1, 1.4], 1)
    expect(clock.advance(1.5)).toEqual([1.1, 1.4])
    expect(clock.advance(1.6)).toEqual([])
  })

  it('preserves clicks at and immediately after a cut boundary', () => {
    const clock = createClickPlaybackCursor([2.5, 4, 4.005], 1.99)
    clock.seek(4, true)
    expect(clock.advance(4.016, [{ id: 'cut', start: 2, end: 4 }])).toEqual([4, 4.005])
    expect(clock.advance(4.03)).toEqual([])
  })

  it('does not burst skipped clicks after manual forward or backward seeks', () => {
    const clock = createClickPlaybackCursor([1, 2, 3, 4], 0)
    clock.seek(3)
    expect(clock.advance(3.1)).toEqual([])
    clock.seek(0.5)
    expect(clock.advance(1.1)).toEqual([1])
  })

  it('lets preview schedule ahead of the playhead without repeating clicks', () => {
    const clock = createClickPlaybackCursor([1, 1.05, 1.3], 0.9)
    expect(clock.advance(1.0 + 0.1)).toEqual([1, 1.05])
    // The next frame's playhead is still behind the scheduled horizon.
    expect(clock.advance(1.02)).toEqual([])
    expect(clock.advance(1.35)).toEqual([1.3])
  })
})

describe('scheduling across a speed change', () => {
  it('stops the look-ahead at the next speed-region edge', () => {
    const regions = [{ start: 3, end: 5 }]
    expect(nextRateChange(2.9, regions)).toBe(3)
    expect(nextRateChange(3.5, regions)).toBe(5)
    expect(nextRateChange(6, regions)).toBe(Infinity)
    expect(nextRateChange(0, [])).toBe(Infinity)
  })

  it('takes a fresh list of clicks while playing, so restoring a clip is heard at once', () => {
    const clock = createPlaybackCursor<number>([1], 0.5, (t) => t)
    expect(clock.advance(1.2)).toEqual([1])
    expect(clock.advance(2.2, [], [1, 2])).toEqual([2])
  })
})
