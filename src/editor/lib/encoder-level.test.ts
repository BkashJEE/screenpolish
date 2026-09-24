import { describe, expect, it } from 'vitest'
import { avcLevel } from './export'

describe('H.264 level for the export size', () => {
  it('claims a level the frame actually fits, so 1440p and 4K stay H.264', () => {
    // Before this, every export claimed level 4.0 (hex 28) and anything above
    // 1080p was rejected outright, falling back to VP9.
    expect(avcLevel(1920, 1080, 30)).toBe('28')
    expect(avcLevel(1920, 1080, 60)).toBe('2a')
    expect(avcLevel(2560, 1440, 30)).toBe('32')
    expect(avcLevel(2560, 1440, 60)).toBe('33')
    expect(avcLevel(3840, 2160, 30)).toBe('33')
    expect(avcLevel(3840, 2160, 60)).toBe('34')
  })

  it('handles vertical and square framings by area, not by height alone', () => {
    expect(avcLevel(1080, 1920, 30)).toBe('28')
    expect(avcLevel(1080, 1080, 60)).toBe('2a')
  })

  it('falls back to the highest level rather than claiming an impossible one', () => {
    expect(avcLevel(7680, 4320, 60)).toBe('3c')
  })
})
