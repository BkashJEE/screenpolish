import { describe, expect, it } from 'vitest'
import { hyprSocketPaths, isHyprland, parseCursorPos } from './hypr'

describe('hyprSocketPaths', () => {
  it('prefers the XDG_RUNTIME_DIR location and keeps /tmp as a fallback', () => {
    expect(hyprSocketPaths({ HYPRLAND_INSTANCE_SIGNATURE: 'abc', XDG_RUNTIME_DIR: '/run/user/1000' })).toEqual([
      '/run/user/1000/hypr/abc/.socket.sock',
      '/tmp/hypr/abc/.socket.sock'
    ])
  })

  it('falls back to /tmp alone when XDG_RUNTIME_DIR is unset', () => {
    expect(hyprSocketPaths({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' })).toEqual(['/tmp/hypr/abc/.socket.sock'])
  })

  it('returns nothing outside a Hyprland session', () => {
    expect(hyprSocketPaths({})).toEqual([])
    expect(hyprSocketPaths({ XDG_RUNTIME_DIR: '/run/user/1000' })).toEqual([])
  })
})

describe('parseCursorPos', () => {
  it('reads the reply Hyprland sends', () => {
    expect(parseCursorPos('1920, 540')).toEqual([1920, 540])
    expect(parseCursorPos('0,0')).toEqual([0, 0])
    expect(parseCursorPos(' 12 , 34 \n')).toEqual([12, 34])
  })

  it('accepts negative coordinates from a monitor left of or above the origin', () => {
    expect(parseCursorPos('-1080, -200')).toEqual([-1080, -200])
  })

  it('rejects anything that is not a coordinate pair', () => {
    expect(parseCursorPos('')).toBeNull()
    expect(parseCursorPos('unknown request')).toBeNull()
    expect(parseCursorPos('1920')).toBeNull()
    expect(parseCursorPos('1920, 540, 3')).toBeNull()
    expect(parseCursorPos('1920.5, 540')).toBeNull()
  })
})

describe('isHyprland', () => {
  it('keys off the instance signature the compositor exports', () => {
    expect(isHyprland({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' })).toBe(true)
    expect(isHyprland({})).toBe(false)
  })
})
