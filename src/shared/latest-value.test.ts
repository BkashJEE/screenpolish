import { describe, expect, it, vi } from 'vitest'
import { latestValue } from './latest-value'

describe('initial editor navigation', () => {
  it('replays a cold-start folder sent before React subscribes', () => {
    const channel = latestValue<string>()
    channel.publish('recording')
    const handler = vi.fn()
    channel.subscribe(handler)
    expect(handler).toHaveBeenCalledExactlyOnceWith('recording')
  })
  it('replays only the latest intent, including the empty library route', () => {
    const channel = latestValue<string>()
    channel.publish('old-recording')
    channel.publish('')
    const handler = vi.fn()
    const off = channel.subscribe(handler)
    expect(handler).toHaveBeenCalledExactlyOnceWith('')
    off()
    channel.publish('new-recording')
    expect(handler).toHaveBeenCalledTimes(1)
    channel.subscribe(handler)
    expect(handler).toHaveBeenLastCalledWith('new-recording')
  })
})
