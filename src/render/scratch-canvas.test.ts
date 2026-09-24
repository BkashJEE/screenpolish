import { afterEach, describe, expect, it, vi } from 'vitest'
import { scratchCanvas } from './scratch-canvas'

afterEach(() => vi.unstubAllGlobals())
describe('destination-owned scratch canvases', () => {
  it('reuses within one destination but isolates preview, export and later exports', () => {
    vi.stubGlobal('OffscreenCanvas', class { constructor(public width: number, public height: number) {} })
    const preview = {}, firstExport = {}, secondExport = {}
    const first = scratchCanvas(preview, 'tilt-card', 640, 360)
    expect(scratchCanvas(preview, 'tilt-card', 640, 360)).toBe(first)
    const exported = scratchCanvas(firstExport, 'tilt-card', 640, 360)
    expect(exported).not.toBe(first)
    expect(scratchCanvas(secondExport, 'tilt-card', 640, 360)).not.toBe(exported)
    expect(scratchCanvas(preview, 'webcam-subject', 640, 360)).not.toBe(first)
    expect(scratchCanvas(preview, 'tilt-card', 320, 180)).not.toBe(first)
  })
})
