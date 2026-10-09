import { describe, expect, it, vi } from 'vitest'
import { AUTO_STOP_MAX_SEC, AutoStop, autoStopMs, type AutoStopClock } from './auto-stop'

/** A clock the test moves by hand. */
function fakeClock(): AutoStopClock & { advance: (ms: number) => void } {
  let now = 0
  let timers: Array<{ at: number; fn: () => void; id: number }> = []
  let next = 1
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = next++
      timers.push({ at: now + ms, fn, id })
      return id
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id)
    },
    advance: (ms) => {
      now += ms
      const due = timers.filter((t) => t.at <= now)
      timers = timers.filter((t) => t.at > now)
      for (const t of due) t.fn()
    }
  }
}

describe('autoStopMs', () => {
  it('takes a sensible length and refuses the rest', () => {
    expect(autoStopMs(30)).toBe(30_000)
    expect(autoStopMs(2.5)).toBe(2500)
    for (const bad of [0, -5, NaN, Infinity, 'soon', undefined, null, AUTO_STOP_MAX_SEC + 1]) expect(autoStopMs(bad)).toBeNull()
  })
})

describe('AutoStop', () => {
  it('stops after the planned length of recording', () => {
    const clock = fakeClock()
    const stop = vi.fn()
    const timer = new AutoStop(30_000, stop, clock)
    timer.run()
    clock.advance(29_999)
    expect(stop).not.toHaveBeenCalled()
    clock.advance(1)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(timer.left).toBe(0)
  })

  it('does not count paused time', () => {
    const clock = fakeClock()
    const stop = vi.fn()
    const timer = new AutoStop(30_000, stop, clock)
    timer.run()
    clock.advance(10_000)
    timer.pause()
    clock.advance(60_000) // a minute paused
    expect(stop).not.toHaveBeenCalled()
    expect(timer.left).toBe(20_000)
    timer.run() // resume
    clock.advance(19_999)
    expect(stop).not.toHaveBeenCalled()
    clock.advance(1)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('never fires once cancelled, and tolerates repeated calls', () => {
    const clock = fakeClock()
    const stop = vi.fn()
    const timer = new AutoStop(5000, stop, clock)
    timer.run()
    timer.run()
    timer.pause()
    timer.pause()
    timer.run()
    timer.cancel()
    clock.advance(10_000)
    expect(stop).not.toHaveBeenCalled()
    timer.run()
    clock.advance(10_000)
    expect(stop).not.toHaveBeenCalled()
  })
})
