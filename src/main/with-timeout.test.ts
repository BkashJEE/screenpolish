import { describe, expect, it, vi } from 'vitest'
import { TIMED_OUT, withTimeout, withTimeoutOrThrow } from './with-timeout'

describe('withTimeout', () => {
  it('returns the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 50)).resolves.toBe('done')
  })

  it('gives up on a promise that never settles', async () => {
    await expect(withTimeout(new Promise<string>(() => {}), 10)).resolves.toBe(TIMED_OUT)
  })

  it('still rejects when the promise fails before the deadline', async () => {
    await expect(withTimeout(Promise.reject(new Error('gsr died')), 50)).rejects.toThrow('gsr died')
  })

  it('swallows a rejection that arrives after the deadline', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const late = new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('too late')), 20))
    await expect(withTimeout(late, 5)).resolves.toBe(TIMED_OUT)
    await new Promise((r) => setTimeout(r, 60))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  it('does not hold the process with a live timer once the promise settles', async () => {
    const spy = vi.spyOn(global, 'clearTimeout')
    await withTimeout(Promise.resolve(1), 10_000)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('withTimeoutOrThrow', () => {
  it('passes the value through', async () => {
    await expect(withTimeoutOrThrow(Promise.resolve(7), 50, 'nope')).resolves.toBe(7)
  })

  it('rejects with the message and the deadline in seconds', async () => {
    await expect(withTimeoutOrThrow(new Promise(() => {}), 20, 'Capture host page did not load'))
      .rejects.toThrow('Capture host page did not load within 0.02 s')
  })

  it('passes the original failure through rather than the deadline', async () => {
    await expect(withTimeoutOrThrow(Promise.reject(new Error('real cause')), 50, 'nope'))
      .rejects.toThrow('real cause')
  })
})
