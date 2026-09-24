import { describe, expect, it, vi } from 'vitest'
import { drawCaptions, CAPTION_BASE } from './captions'
import type { Ctx2D } from './render-frame'
import type { CaptionSettings } from '../shared/captions'

function recordingContext() {
  const texts: Array<{ text: string; x: number; y: number; font: string }> = []
  const ctx = {
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(),
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    measureText(s: string) {
      const px = Number(/([\d.]+)px/.exec(this.font)?.[1] ?? 0)
      return { width: s.length * px * 0.5 }
    },
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font })
    }
  }
  return { ctx, texts }
}

const cues = [
  { id: 'a', start: 1, end: 3, text: 'Open the settings panel' },
  { id: 'b', start: 3, end: 5, text: 'Then pick a background' }
]
const out = { width: 1920, height: 1080 }

describe('drawCaptions', () => {
  it('draws the cue for the current time, centred near the bottom', () => {
    const { ctx, texts } = recordingContext()
    drawCaptions(ctx as unknown as Ctx2D, out, { enabled: true, cues, size: 1, position: 'bottom' }, 2)
    expect(texts.map((t) => t.text)).toEqual(['Open the settings panel'])
    expect(texts[0].x).toBe(960)
    expect(texts[0].y).toBeGreaterThan(1080 * 0.8)
    expect(texts[0].font).toContain(`${1080 * CAPTION_BASE}px`)
    expect(ctx.restore).toHaveBeenCalledOnce()
  })

  it('moves to the top when asked', () => {
    const { ctx, texts } = recordingContext()
    drawCaptions(ctx as unknown as Ctx2D, out, { enabled: true, cues, size: 1, position: 'top' }, 4)
    expect(texts[0].text).toBe('Then pick a background')
    expect(texts[0].y).toBeLessThan(1080 * 0.2)
  })

  it('draws nothing when captions are off, between cues, or with no cues', () => {
    const cases: Array<[CaptionSettings, number]> = [
      [{ enabled: false, cues, size: 1, position: 'bottom' }, 2],
      [{ enabled: true, cues, size: 1, position: 'bottom' }, 6],
      [{ enabled: true, cues: [], size: 1, position: 'bottom' }, 2]
    ]
    for (const [settings, t] of cases) {
      const { ctx, texts } = recordingContext()
      drawCaptions(ctx as unknown as Ctx2D, out, settings, t)
      expect(texts).toEqual([])
      expect(ctx.fill).not.toHaveBeenCalled()
    }
    const { ctx } = recordingContext()
    drawCaptions(ctx as unknown as Ctx2D, out, undefined, 2)
    expect(ctx.save).not.toHaveBeenCalled()
  })

  it('wraps a long line onto two, both inside the frame', () => {
    const { ctx, texts } = recordingContext()
    const long = [{ id: 'l', start: 0, end: 9, text: 'This is a much longer caption that will not fit on a single line of the frame at all' }]
    drawCaptions(ctx as unknown as Ctx2D, out, { enabled: true, cues: long, size: 1.8, position: 'bottom' }, 1)
    expect(texts).toHaveLength(2)
    expect(texts[1].y).toBeGreaterThan(texts[0].y)
  })

  it('scales with the output, so 720p and 4K look the same', () => {
    const small = recordingContext()
    const large = recordingContext()
    drawCaptions(small.ctx as unknown as Ctx2D, { width: 1280, height: 720 }, { enabled: true, cues, size: 1, position: 'bottom' }, 2)
    drawCaptions(large.ctx as unknown as Ctx2D, { width: 3840, height: 2160 }, { enabled: true, cues, size: 1, position: 'bottom' }, 2)
    expect(large.texts[0].y / small.texts[0].y).toBeCloseTo(3, 6)
  })
})
