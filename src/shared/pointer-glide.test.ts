import { describe, expect, it } from 'vitest'
import { glidePointerPath, pointerPathFor, smoothPointerPath } from './pointer'
import type { RecordingEvents } from './types'

const region = { x: 0, y: 0, width: 1600, height: 1200, scale: 1 } // diagonal 2000 px

/** Rest at A, flick to B in `flickMs`, rest, click at B. Sampled every 8 ms like a mouse. */
function takeWithFlick(flickMs: number, clickAt = 1400): RecordingEvents {
  const pointer: Array<[number, number, number]> = []
  for (let t = 0; t <= 2000; t += 8) {
    const u = Math.min(1, Math.max(0, (t - 1000) / flickMs))
    pointer.push([t, 200 + 1200 * u, 600])
  }
  return { version: 1, startedAt: 0, region, pointer, clicks: [{ t: clickAt, x: 1400, y: 600, button: 'left', down: true }, { t: clickAt + 80, x: 1400, y: 600, button: 'left', down: false }], wheel: [], keys: [] }
}

function peakSpeed(path: Array<[number, number, number]>): number {
  let peak = 0
  for (let i = 1; i < path.length; i++) {
    const dt = path[i]![0] - path[i - 1]![0]
    if (dt > 0) peak = Math.max(peak, Math.hypot(path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2]) / dt)
  }
  return peak * 1000
}

const at = (path: Array<[number, number, number]>, t: number) => path.reduce((b, s) => (Math.abs(s[0] - t) < Math.abs(b[0] - t) ? s : b))

describe('glidePointerPath', () => {
  it('slows a flick to the glide limit and still lands on the click', () => {
    const events = takeWithFlick(100) // 1200 px in 0.1 s
    const smooth = smoothPointerPath(events, 0)
    const glided = glidePointerPath(smooth, events.clicks, region, 1)
    expect(peakSpeed(smooth)).toBeGreaterThan(10_000)
    // Full glide allows 0.9 diagonals a second, with a little sampling slack.
    expect(peakSpeed(glided)).toBeLessThan(2000 * 0.9 * 1.1)
    const click = at(glided, 1400)
    expect(click[1]).toBeCloseTo(1400, 0)
    expect(click[2]).toBe(600)
  })

  it('sets off earlier rather than arriving late', () => {
    const events = takeWithFlick(100)
    const glided = glidePointerPath(smoothPointerPath(events, 0), events.clicks, region, 1)
    // Already on its way before the hand moved at 1000 ms.
    expect(at(glided, 900)[1]).toBeGreaterThan(200)
    // At rest on the target well before the click at 1400 ms.
    expect(at(glided, 1340)[1]).toBeCloseTo(1400, 0)
  })

  it('leaves calm moves, and glide 0, exactly as they were', () => {
    const calm = takeWithFlick(1500)
    const smooth = smoothPointerPath(calm, 0)
    expect(glidePointerPath(smooth, calm.clicks, region, 1)).toEqual(smooth)
    const fast = takeWithFlick(100)
    const fastSmooth = smoothPointerPath(fast, 0)
    expect(glidePointerPath(fastSmooth, fast.clicks, region, 0)).toBe(fastSmooth)
  })

  it('does not move the pointer off a click made mid-move, like a drag', () => {
    const events = takeWithFlick(100, 1050) // pressed while the flick is under way
    const smooth = smoothPointerPath(events, 0)
    const glided = glidePointerPath(smooth, events.clicks, region, 1)
    expect(at(glided, 1050)).toEqual(at(smooth, 1050))
  })

  it('never lets two retimed moves overlap into a jump', () => {
    // Two flicks 300 ms apart, both far too fast.
    const pointer: Array<[number, number, number]> = []
    for (let t = 0; t <= 3000; t += 8) {
      const x = t < 1000 ? 200 : t < 1080 ? 200 + 1200 * ((t - 1000) / 80) : t < 1380 ? 1400 : t < 1460 ? 1400 - 1200 * ((t - 1380) / 80) : 200
      pointer.push([t, x, 600])
    }
    const events: RecordingEvents = { version: 1, startedAt: 0, region, pointer, clicks: [], wheel: [], keys: [] }
    const glided = glidePointerPath(smoothPointerPath(events, 0), [], region, 1)
    // No sample-to-sample teleport: the fastest step stays near the limit.
    expect(peakSpeed(glided)).toBeLessThan(2000 * 0.9 * 2)
    for (let i = 1; i < glided.length; i++) expect(glided[i]![0]).toBeGreaterThan(glided[i - 1]![0])
  })

  it('is what the editor and export draw, through pointerPathFor', () => {
    const events = takeWithFlick(100)
    expect(pointerPathFor(events, { smoothing: 0, glide: 1 })).toEqual(glidePointerPath(smoothPointerPath(events, 0), events.clicks, region, 1))
    expect(pointerPathFor(events, { smoothing: 0 })).toEqual(smoothPointerPath(events, 0))
  })
})
