import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, throttle } from './debounce'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounce', () => {
  it('calls once with the last arguments after the wait', () => {
    const fn = vi.fn()
    const d = debounce(fn, 500)
    d(1)
    d(2)
    d(3)
    expect(fn).not.toHaveBeenCalled()
    expect(d.pending()).toBe(true)
    vi.advanceTimersByTime(499)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(3)
    expect(d.pending()).toBe(false)
  })

  it('restarts the timer on every call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('a')
    vi.advanceTimersByTime(80)
    d('b')
    vi.advanceTimersByTime(80)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(fn).toHaveBeenCalledWith('b')
  })

  it('flush runs the pending call immediately and only once', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('x')
    d.flush()
    expect(fn).toHaveBeenCalledWith('x')
    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
    d.flush() // nothing pending: no-op
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('x')
    d.cancel()
    vi.advanceTimersByTime(200)
    expect(fn).not.toHaveBeenCalled()
    expect(d.pending()).toBe(false)
  })
})

describe('throttle', () => {
  it('fires immediately, then at most once per interval with the latest args', () => {
    const fn = vi.fn()
    const t = throttle(fn, 100)
    t(1)
    expect(fn).toHaveBeenCalledWith(1)
    t(2)
    t(3)
    expect(fn).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(3)
  })
})
