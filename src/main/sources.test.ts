import { describe, expect, it } from 'vitest'
import type { DesktopCapturerSource, Display, NativeImage } from 'electron'
import { displaySourceInfos, listsThroughPortal, portalSourceTypes } from './sources'

it('requests only windows for application capture and only monitors for screen/region capture', () => {
  expect(portalSourceTypes('window')).toEqual(['window'])
  expect(portalSourceTypes('screen')).toEqual(['screen'])
  expect(portalSourceTypes('region')).toEqual(['screen'])
})

const image = (empty: boolean, url = 'data:image/png;base64,screen') =>
  ({ isEmpty: () => empty, toDataURL: () => url }) as NativeImage

const display = (id: number, x: number, width: number, height: number, scaleFactor = 1): Display =>
  ({ id, bounds: { x, y: 0, width, height }, workArea: { x, y: 0, width, height }, scaleFactor, rotation: 0, touchSupport: 'unknown', monochrome: false, colorDepth: 24, colorSpace: 'srgb', depthPerComponent: 8, displayFrequency: 60, detected: true, internal: id === 1, label: `Display ${id}`, maximumCursorSize: { width: 64, height: 64 }, nativeOrigin: { x, y: 0 }, size: { width, height }, workAreaSize: { width, height } }) as Display

const source = (displayId: number, thumbnail: NativeImage): DesktopCapturerSource =>
  ({ id: `screen:${displayId}:0`, name: `Screen ${displayId}`, display_id: String(displayId), thumbnail, appIcon: image(true) })

describe('displaySourceInfos', () => {
  it('keeps every display recordable when capture previews are unavailable', () => {
    const rows = displaySourceInfos([display(1, 0, 1920, 1080), display(2, 1920, 1280, 720, 1.25)], 1)
    expect(rows.map((row) => ({ id: row.id, name: row.name, thumbnail: row.thumbnail }))).toEqual([
      { id: '1', name: 'Primary display (1920×1080)', thumbnail: undefined },
      { id: '2', name: 'Display 2 (1600×900)', thumbnail: undefined }
    ])
  })

  it('matches previews by display id instead of capture-source order', () => {
    const rows = displaySourceInfos(
      [display(1, 0, 1920, 1080), display(2, 1920, 1280, 720)],
      1,
      [source(2, image(false, 'data:two')), source(1, image(false, 'data:one'))]
    )
    expect(rows.map((row) => row.thumbnail)).toEqual(['data:one', 'data:two'])
  })
})

describe('listsThroughPortal', () => {
  it('skips portal enumeration only on Linux Wayland sessions', () => {
    expect(listsThroughPortal('linux', { XDG_SESSION_TYPE: 'wayland' })).toBe(true)
    expect(listsThroughPortal('linux', { WAYLAND_DISPLAY: 'wayland-1' })).toBe(true)
    expect(listsThroughPortal('linux', { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' })).toBe(false)
    expect(listsThroughPortal('win32', { WAYLAND_DISPLAY: 'wayland-1' })).toBe(false)
  })
})
