import { describe, expect, it } from 'vitest'
import { LOCAL_FRESH_MS, placeFromPoll } from './follow'

const display = { origin: { x: 0, y: 0 }, size: { width: 2560, height: 1440 } }

describe('placeFromPoll', () => {
  it('takes over within a frame or two when forwarded moves stop - it used to freeze for 250 ms', () => {
    // 100 ms after the last forwarded move, as when the pointer slides onto the
    // recording HUD. The old rule ignored every poll until 250 ms had passed.
    const next = placeFromPoll(100, 0, { x: 800, y: 600 }, display.origin, display.size)
    expect(next).toEqual({ action: 'place', x: 800, y: 600 })
  })

  it('stays out of the way while forwarded moves are still arriving', () => {
    // A poll that lands between forwarded moves is older and coarser than they
    // are, so it must not overwrite them.
    expect(placeFromPoll(LOCAL_FRESH_MS - 1, 0, { x: 800, y: 600 }, display.origin, display.size)).toEqual({ action: 'ignore' })
    expect(placeFromPoll(LOCAL_FRESH_MS, 0, { x: 800, y: 600 }, display.origin, display.size).action).toBe('place')
  })

  it('hides the sprite at once when the pointer has moved to another display', () => {
    // Even with a forwarded move only 10 ms old. Waiting out the freshness
    // window first is what left a stale ghost stuck at the edge of the display
    // you had just left.
    expect(placeFromPoll(10, 0, { x: 3000, y: 600 }, display.origin, display.size)).toEqual({ action: 'hide' })
  })

  it('works in the coordinates of a second display, not the first', () => {
    const right = { origin: { x: 2560, y: 0 }, size: { width: 1920, height: 1080 } }
    expect(placeFromPoll(500, 0, { x: 2660, y: 50 }, right.origin, right.size)).toEqual({ action: 'place', x: 100, y: 50 })
    // The same screen point is off the first display entirely.
    expect(placeFromPoll(500, 0, { x: 2660, y: 50 }, display.origin, display.size)).toEqual({ action: 'hide' })
  })

  it('treats the far edges as outside, the near edges as inside', () => {
    const at = (x: number, y: number) => placeFromPoll(500, 0, { x, y }, display.origin, display.size).action
    expect(at(0, 0)).toBe('place')
    expect(at(2559, 1439)).toBe('place')
    expect(at(2560, 100)).toBe('hide')
    expect(at(100, 1440)).toBe('hide')
    expect(at(-1, 100)).toBe('hide')
  })
})
