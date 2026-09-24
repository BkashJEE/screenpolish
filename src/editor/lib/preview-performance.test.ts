import { describe, it, expect } from 'vitest'
import { previewSize, shouldRenderPreview, previewPacer } from './preview-performance'

describe('preview playback budget', () => {
  it('keeps sharp 1080p playback native in either orientation', () => {
    expect(previewSize({ width: 1920, height: 1080 }, true, 'sharp')).toEqual({ width: 1920, height: 1080 })
    expect(previewSize({ width: 1080, height: 1920 }, true, 'sharp')).toEqual({ width: 1080, height: 1920 })
    expect(previewSize({ width: 3840, height: 2160 }, true, 'sharp')).toEqual({ width: 1920, height: 1080 })
  })
  it('paces 60fps without discarding every other frame', () => {
    const due = previewPacer(60)
    expect([0, 16.67, 33.34, 50, 66.67].map(due)).toEqual(Array(5).fill(true))
  })
  it('does not accumulate callback jitter into the next draw deadline', () => {
    const due = previewPacer()
    expect([0, 34, 67, 100, 134, 167, 200].map(due)).toEqual(Array(7).fill(true))
  })
  it('skips missed deadlines without a catch-up burst', () => {
    const due = previewPacer()
    expect(due(0)).toBe(true)
    expect(due(250)).toBe(true)
    expect(due(251)).toBe(false)
    expect(due(267)).toBe(true)
  })
  it('skips alternate 60fps draws without queuing catch-up work', () => {
    expect(shouldRenderPreview(0, -Infinity)).toBe(true)
    expect(shouldRenderPreview(16.67, 0)).toBe(false)
    expect(shouldRenderPreview(33.33, 0)).toBe(true)
    expect(shouldRenderPreview(250, 0)).toBe(true)
  })
  it('reduces 1080p playback pixel work by over half', () => {
    expect(previewSize({ width: 1920, height: 1080 }, true)).toEqual({ width: 1280, height: 720 })
  })
  it('preserves portrait aspect and never upscales', () => {
    expect(previewSize({ width: 1080, height: 1920 }, true)).toEqual({ width: 405, height: 720 })
    expect(previewSize({ width: 640, height: 360 }, true)).toEqual({ width: 640, height: 360 })
  })
  it('keeps paused editing at the full project resolution', () => {
    expect(previewSize({ width: 3840, height: 2160 }, false)).toEqual({ width: 3840, height: 2160 })
  })
})
