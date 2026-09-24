import { describe, expect, it } from 'vitest'
import { PREVIEW_OPEN_DELAY_MS, previewOpenDelay, previewSeekTime } from './hover-preview'

describe('previewOpenDelay', () => {
  it('waits before the first preview and switches at once after that', () => {
    expect(previewOpenDelay(false)).toBe(PREVIEW_OPEN_DELAY_MS)
    expect(previewOpenDelay(true)).toBe(0)
  })
})

describe('previewSeekTime', () => {
  it('maps the pointer across the card onto the recording', () => {
    expect(previewSeekTime(0, 3000)).toBe(0)
    expect(previewSeekTime(0.5, 3000)).toBe(1500)
  })

  it('stops short of the end, and clamps a pointer outside the card', () => {
    expect(previewSeekTime(1, 60)).toBeCloseTo(59.95, 6)
    expect(previewSeekTime(1.4, 60)).toBeCloseTo(59.95, 6)
    expect(previewSeekTime(-0.2, 60)).toBe(0)
  })

  it('does not seek before the video knows its length', () => {
    expect(previewSeekTime(0.5, NaN)).toBeNull()
    expect(previewSeekTime(0.5, Infinity)).toBeNull()
    expect(previewSeekTime(0.5, 0)).toBeNull()
  })
})
