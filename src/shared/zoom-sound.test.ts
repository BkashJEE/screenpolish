import { describe, expect, it } from 'vitest'
import type { ZoomSegment } from './types'
import { cameraAt } from './camera'
import { audibleZoomTransitions, zoomSound, zoomSoundRuns, zoomSoundSeconds, zoomTransitions, ZOOM_SAMPLE_RATE } from './zoom-sound'

const seg = (id: string, start: number, end: number, x = 800, y = 500): ZoomSegment => ({ id, start, end, x, y, scale: 2, source: 'auto' })
const region = { width: 1920, height: 1080 }

describe('zoom transitions', () => {
  it('zooms in at each start, pans between close zooms, zooms out otherwise', () => {
    const t = zoomTransitions([seg('c', 10, 12), seg('a', 1, 3), seg('b', 3.8, 6)], 0.6)
    expect(t).toEqual([
      { t: 1, move: 'in' },
      { t: 3.8, move: 'pan' },
      { t: 5.7, move: 'out' },
      { t: 10, move: 'in' },
      { t: 11.7, move: 'out' }
    ])
  })

  it('places each sound where the camera actually starts moving', () => {
    const segments = [seg('a', 2, 6)]
    for (const m of zoomTransitions(segments, 0.6)) {
      const before = cameraAt(m.t - 0.05, segments, null, region).scale
      const after = cameraAt(m.t + 0.15, segments, null, region).scale
      expect(Math.abs(after - before)).toBeGreaterThan(0.1)
    }
  })

  it('drops moves outside the trim or inside a removed clip', () => {
    const moves = zoomTransitions([seg('a', 1, 3), seg('b', 8, 9)], 0.6)
    expect(audibleZoomTransitions(moves, { start: 0, end: 8.5 }, [{ id: 'c', start: 2.5, end: 3 }]).map((m) => m.t)).toEqual([1, 8])
  })
})

describe('zoom sounds', () => {
  it('are gentle, deterministic whooshes that start and end in silence', () => {
    for (const move of ['in', 'out', 'pan'] as const) {
      const s = zoomSound(move, 0.6)
      expect(s.length).toBe(Math.round(zoomSoundSeconds(move, 0.6) * ZOOM_SAMPLE_RATE))
      const peak = Math.max(...Array.from(s, Math.abs))
      expect(peak).toBeLessThanOrEqual(0.451)
      expect(peak).toBeGreaterThan(0.2)
      // No click at either end: the first and last 5 ms stay near silent.
      const edge = Math.round(0.005 * ZOOM_SAMPLE_RATE)
      expect(Math.max(...Array.from(s.slice(0, edge), Math.abs))).toBeLessThan(0.02)
      expect(Math.max(...Array.from(s.slice(-edge), Math.abs))).toBeLessThan(0.02)
      expect(zoomSound(move, 0.6)).toBe(s)
    }
    expect(zoomSoundSeconds('out', 0.6)).toBeGreaterThan(zoomSoundSeconds('in', 0.6))
  })

  it('rises in pitch when zooming in and falls when zooming out', () => {
    const brightness = (s: Float32Array, from: number, to: number) => {
      const a = Math.floor(s.length * from)
      const b = Math.floor(s.length * to)
      let crossings = 0
      for (let i = a + 1; i < b; i++) if ((s[i - 1] < 0) !== (s[i] < 0)) crossings++
      return crossings / (b - a)
    }
    const zin = zoomSound('in', 0.6)
    const zout = zoomSound('out', 0.6)
    expect(brightness(zin, 0.6, 0.8)).toBeGreaterThan(brightness(zin, 0.15, 0.35))
    expect(brightness(zout, 0.6, 0.8)).toBeLessThan(brightness(zout, 0.15, 0.35))
  })

  it('mixes into runs, scaled by volume, and makes nothing when off or silent', () => {
    const moves = zoomTransitions([seg('a', 1, 3)], 0.6)
    expect(zoomSoundRuns(moves, 0.6, { enabled: false, volume: 1 })).toEqual([])
    expect(zoomSoundRuns(moves, 0.6, { enabled: true, volume: 0 })).toEqual([])
    const runs = zoomSoundRuns(moves, 0.6, { enabled: true, volume: 0.5 })
    expect(runs.map((r) => r.start)).toEqual([1, 2.7])
    expect(Math.max(...Array.from(runs[0].samples, Math.abs))).toBeCloseTo(0.225, 2)
  })
})
