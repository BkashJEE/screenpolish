import { describe, expect, it } from 'vitest'
import { WL_COPY_ARGS, useWlCopy } from './clipboard-file'

describe('useWlCopy', () => {
  it('is used on a Wayland session', () => {
    expect(useWlCopy('linux', { WAYLAND_DISPLAY: 'wayland-1' })).toBe(true)
  })

  it('is not used under X11, where Chromium owns the selection normally', () => {
    expect(useWlCopy('linux', { DISPLAY: ':0' })).toBe(false)
  })

  it('is not used off Linux', () => {
    expect(useWlCopy('win32', { WAYLAND_DISPLAY: 'wayland-1' })).toBe(false)
    expect(useWlCopy('darwin', {})).toBe(false)
  })
})

describe('WL_COPY_ARGS', () => {
  it('asks for the type that also yields text/plain to other clients', () => {
    expect(WL_COPY_ARGS).toEqual(['--type', 'text/uri-list'])
  })
})
