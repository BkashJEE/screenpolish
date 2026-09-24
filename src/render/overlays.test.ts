import { describe, expect, it } from 'vitest'
import type { Overlay } from '../shared/types'
import {
  EMOJI_FONT,
  LINE_HEIGHT,
  REF_FONT_PX,
  TEXT_PAD,
  drawOrder,
  drawOverlays,
  fontFor,
  layoutOverlay,
  layoutOverlays,
  overlayAlphaAt,
  overlayBox,
  overlayEnd,
  textLines,
  type OverlayDrawArgs
} from './overlays'
import type { Ctx2D } from './render-frame'

// ---------------------------------------------------------------------------
// Fake 2D context: records calls and property sets; measureText is 60 px per
// character (the module always measures at REF_FONT_PX before scaling).

interface Call {
  name: string
  args: unknown[]
}

class FakeContext {
  calls: Call[] = []
  props: Array<[string, unknown]> = []
  canvas: { width: number; height: number }
  constructor(width: number, height: number) {
    this.canvas = { width, height }
  }
  private rec(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args })
  }
  save(): void { this.rec('save') }
  restore(): void { this.rec('restore') }
  translate(x: number, y: number): void { this.rec('translate', x, y) }
  rotate(r: number): void { this.rec('rotate', r) }
  beginPath(): void { this.rec('beginPath') }
  closePath(): void { this.rec('closePath') }
  moveTo(x: number, y: number): void { this.rec('moveTo', x, y) }
  arcTo(...a: number[]): void { this.rec('arcTo', ...a) }
  rect(...a: number[]): void { this.rec('rect', ...a) }
  fill(): void { this.rec('fill') }
  fillText(text: string, x: number, y: number): void { this.rec('fillText', text, x, y) }
  strokeText(text: string, x: number, y: number): void { this.rec('strokeText', text, x, y) }
  drawImage(...a: unknown[]): void { this.rec('drawImage', ...a) }
  measureText(text: string): { width: number } {
    this.rec('measureText', text)
    return { width: text.length * 60 }
  }
  named(name: string): Call[] {
    return this.calls.filter((c) => c.name === name)
  }
  propValues(name: string): unknown[] {
    return this.props.filter(([k]) => k === name).map(([, v]) => v)
  }
}

const METHODS = new Set(Object.getOwnPropertyNames(FakeContext.prototype))

function makeCtx(width = 1920, height = 1080): { ctx: Ctx2D; fake: FakeContext } {
  const fake = new FakeContext(width, height)
  const proxy = new Proxy(fake, {
    set(target, key, value) {
      if (typeof key === 'string' && !METHODS.has(key) && key !== 'canvas') target.props.push([key, value])
      return Reflect.set(target, key, value)
    }
  })
  return { ctx: proxy as unknown as Ctx2D, fake }
}

const OUT = { width: 1920, height: 1080 }

function overlay(over: Partial<Overlay> = {}): Overlay {
  return {
    id: 'a',
    kind: 'emoji',
    content: '🔥',
    x: 0.5,
    y: 0.5,
    w: 0.2,
    rotation: 0,
    start: 1,
    end: 3,
    pinned: false,
    fadeSec: 0,
    ...over
  }
}

function args(over: Partial<OverlayDrawArgs> = {}): OverlayDrawArgs {
  return { tSec: 2, output: OUT, images: new Map(), ...over }
}

// ---------------------------------------------------------------------------

describe('overlayEnd', () => {
  it('uses end when set, the duration when 0, and open-ended without a duration', () => {
    expect(overlayEnd({ end: 4 }, 10)).toBe(4)
    expect(overlayEnd({ end: 0 }, 10)).toBe(10)
    expect(overlayEnd({ end: 0 })).toBe(Infinity)
    expect(overlayEnd({ end: 0 }, NaN)).toBe(Infinity)
  })
})

describe('overlayAlphaAt', () => {
  it('is 0 outside the range and 1 inside without a fade', () => {
    const o = { start: 1, end: 3, fadeSec: 0 }
    expect(overlayAlphaAt(o, 0.99)).toBe(0)
    expect(overlayAlphaAt(o, 1)).toBe(1)
    expect(overlayAlphaAt(o, 2)).toBe(1)
    expect(overlayAlphaAt(o, 3)).toBe(1)
    expect(overlayAlphaAt(o, 3.01)).toBe(0)
  })
  it('ramps in and out over fadeSec', () => {
    const o = { start: 1, end: 3, fadeSec: 0.5 }
    expect(overlayAlphaAt(o, 1)).toBe(0)
    expect(overlayAlphaAt(o, 1.25)).toBeCloseTo(0.5)
    expect(overlayAlphaAt(o, 1.5)).toBe(1)
    expect(overlayAlphaAt(o, 2)).toBe(1)
    expect(overlayAlphaAt(o, 2.75)).toBeCloseTo(0.5)
    expect(overlayAlphaAt(o, 3)).toBe(0)
  })
  it('end 0 runs to the duration and fades out there; without a duration it never fades out', () => {
    const o = { start: 0, end: 0, fadeSec: 1 }
    expect(overlayAlphaAt(o, 9.5, 10)).toBeCloseTo(0.5)
    expect(overlayAlphaAt(o, 10.5, 10)).toBe(0)
    expect(overlayAlphaAt(o, 1e6)).toBe(1)
  })
  it('a fade longer than the range never exceeds the shorter side', () => {
    const o = { start: 1, end: 2, fadeSec: 2 }
    expect(overlayAlphaAt(o, 1.5)).toBeCloseTo(0.25)
  })
})

describe('overlayBox', () => {
  it('scales width by w and keeps the measured aspect, centred at x,y', () => {
    const box = overlayBox({ x: 0.5, y: 0.25, w: 0.25 }, OUT, { width: 200, height: 100 })
    expect(box.width).toBeCloseTo(480)
    expect(box.height).toBeCloseTo(240)
    expect(box.x + box.width / 2).toBeCloseTo(960)
    expect(box.y + box.height / 2).toBeCloseTo(270)
  })
  it('treats a degenerate measurement as square', () => {
    const box = overlayBox({ x: 0.5, y: 0.5, w: 0.1 }, OUT, { width: 0, height: 0 })
    expect(box.height).toBeCloseTo(box.width)
  })
})

describe('drawOrder / textLines / fontFor', () => {
  it('puts pinned overlays first, keeping relative order', () => {
    const list = [overlay({ id: 'u1' }), overlay({ id: 'p1', pinned: true }), overlay({ id: 'u2' }), overlay({ id: 'p2', pinned: true })]
    expect(drawOrder(list).map((o) => o.id)).toEqual(['p1', 'p2', 'u1', 'u2'])
  })
  it('splits lines on any newline flavour', () => {
    expect(textLines('a\r\nb\nc')).toEqual(['a', 'b', 'c'])
    expect(textLines('')).toEqual([''])
  })
  it('builds the emoji and text font strings', () => {
    expect(fontFor({ kind: 'emoji' }, 40)).toBe(`40px ${EMOJI_FONT}`)
    expect(fontFor({ kind: 'text', text: { font: 'Georgia', weight: 600, color: '#fff', outline: '#000', outlineWidth: 0, align: 'left' } }, 40)).toBe('600 40px "Georgia", sans-serif')
    expect(fontFor({ kind: 'text' }, 10)).toBe('800 10px "Segoe UI", sans-serif')
  })
})

describe('layoutOverlay', () => {
  it('sizes an emoji so its rendered width is w × output width', () => {
    const { ctx, fake } = makeCtx()
    const f = layoutOverlay(ctx, overlay({ content: '🔥' }), args())
    expect(f).not.toBeNull()
    // measured 60 px wide at 100 px font (2 UTF-16 units for the emoji is irrelevant: the fake counts characters).
    const measuredW = '🔥'.length * 60
    expect(f!.width).toBeCloseTo(0.2 * 1920)
    expect(f!.fontPx).toBeCloseTo((REF_FONT_PX * 0.2 * 1920) / measuredW)
    expect(f!.height).toBeCloseTo((f!.width * REF_FONT_PX * LINE_HEIGHT) / measuredW)
    expect(f!.cx).toBeCloseTo(960)
    expect(f!.cy).toBeCloseTo(540)
    expect(fake.named('measureText')).toHaveLength(1)
  })
  it('caches measurements per font and content', () => {
    const { ctx, fake } = makeCtx()
    layoutOverlay(ctx, overlay({ id: 'x', content: 'cached-1' }), args())
    layoutOverlay(ctx, overlay({ id: 'y', content: 'cached-1' }), args())
    layoutOverlay(ctx, overlay({ id: 'z', content: 'cached-1', w: 0.9 }), args())
    expect(fake.named('measureText')).toHaveLength(1)
  })
  it('multi-line text grows in height and a background pads the box', () => {
    const { ctx } = makeCtx()
    const plain = layoutOverlay(ctx, overlay({ kind: 'text', content: 'ab\ncd', w: 0.5, text: { font: 'Segoe UI', color: '#fff', outline: '#000', outlineWidth: 0, weight: 400, align: 'center' } }), args())!
    expect(plain.height / plain.width).toBeCloseTo((2 * REF_FONT_PX * LINE_HEIGHT) / 120)
    const boxed = layoutOverlay(
      ctx,
      overlay({ kind: 'text', content: 'ab\ncd', w: 0.5, text: { font: 'Segoe UI', color: '#fff', outline: '#000', outlineWidth: 0, weight: 400, align: 'center', background: '#000' } }),
      args()
    )!
    const pad = REF_FONT_PX * TEXT_PAD
    expect(boxed.height / boxed.width).toBeCloseTo((2 * REF_FONT_PX * LINE_HEIGHT + 2 * pad) / (120 + 2 * pad))
    expect(boxed.fontPx).toBeLessThan(plain.fontPx)
  })
  it('uses the image size for aspect and returns null when the image is missing', () => {
    const { ctx } = makeCtx()
    const img = { naturalWidth: 400, naturalHeight: 100 } as unknown as CanvasImageSource
    const f = layoutOverlay(ctx, overlay({ kind: 'image', content: 'C:\\pic.png', w: 0.5 }), args({ images: new Map([['C:\\pic.png', img]]) }))!
    expect(f.width).toBeCloseTo(960)
    expect(f.height).toBeCloseTo(240)
    expect(f.fontPx).toBe(0)
    expect(layoutOverlay(ctx, overlay({ kind: 'image', content: 'missing' }), args())).toBeNull()
  })
  it('maps pinned overlays through toOutput and scales them', () => {
    const { ctx } = makeCtx()
    const toOutput = (x: number, y: number) => ({ x: x * 1920 + 100, y: y * 1080 - 50, scale: 2 })
    const f = layoutOverlay(ctx, overlay({ pinned: true }), args({ toOutput }))!
    expect(f.cx).toBeCloseTo(1060)
    expect(f.cy).toBeCloseTo(490)
    expect(f.width).toBeCloseTo(0.2 * 1920 * 2)
    const unpinned = layoutOverlay(ctx, overlay({ pinned: false }), args({ toOutput }))!
    expect(unpinned.cx).toBeCloseTo(960)
  })
  it('reports alpha from the time range unless skipTime is set', () => {
    const { ctx } = makeCtx()
    expect(layoutOverlay(ctx, overlay(), args({ tSec: 5 }))!.alpha).toBe(0)
    expect(layoutOverlay(ctx, overlay(), args({ tSec: 5, skipTime: true }))!.alpha).toBe(1)
  })
  it('layoutOverlays returns frames in draw order and drops missing images', () => {
    const { ctx } = makeCtx()
    const frames = layoutOverlays(ctx, [overlay({ id: 'u' }), overlay({ id: 'p', pinned: true }), overlay({ id: 'img', kind: 'image', content: 'nope' })], args())
    expect(frames.map((f) => f.id)).toEqual(['p', 'u'])
  })
})

describe('drawOverlays', () => {
  it('draws an emoji with fillText at the centre, rotated, with the scaled font', () => {
    const { ctx, fake } = makeCtx()
    drawOverlays(ctx, [overlay({ content: '🔥', rotation: 90 })], args())
    const fills = fake.named('fillText')
    expect(fills).toHaveLength(1)
    expect(fills[0].args).toEqual(['🔥', 0, 0])
    expect(fake.named('translate')[0].args.map((v) => Math.round(v as number))).toEqual([960, 540])
    expect(fake.named('rotate')[0].args[0]).toBeCloseTo(Math.PI / 2)
    const font = fake.propValues('font').find((f) => String(f).includes('Segoe UI Emoji')) as string
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)![1])
    expect(px).toBeCloseTo((REF_FONT_PX * 0.2 * 1920) / ('🔥'.length * 60), 0)
    expect(fake.propValues('globalAlpha')).toEqual([1])
    expect(fake.named('save')).toHaveLength(1)
    expect(fake.named('restore')).toHaveLength(1)
  })

  it('draws nothing outside the time range and applies the fade alpha inside it', () => {
    const before = makeCtx()
    drawOverlays(before.ctx, [overlay({ fadeSec: 0.5 })], args({ tSec: 0.5 }))
    expect(before.fake.named('fillText')).toHaveLength(0)

    const fading = makeCtx()
    drawOverlays(fading.ctx, [overlay({ fadeSec: 0.5 })], args({ tSec: 1.25 }))
    expect(fading.fake.named('fillText')).toHaveLength(1)
    expect(fading.fake.propValues('globalAlpha')[0]).toBeCloseTo(0.5)

    const after = makeCtx()
    drawOverlays(after.ctx, [overlay()], args({ tSec: 3.5 }))
    expect(after.fake.named('fillText')).toHaveLength(0)
  })

  it('skipTime draws an overlay even outside its range', () => {
    const { ctx, fake } = makeCtx()
    drawOverlays(ctx, [overlay()], args({ tSec: 99, skipTime: true }))
    expect(fake.named('fillText')).toHaveLength(1)
  })

  it('strokes then fills each text line, honours align, and paints the background pill', () => {
    const { ctx, fake } = makeCtx()
    const text: Overlay = overlay({
      kind: 'text',
      content: 'Hello\nWorld',
      w: 0.5,
      text: { font: 'Impact', color: '#ff0000', outline: '#00ff00', outlineWidth: 10, weight: 600, align: 'left', background: '#112233' }
    })
    drawOverlays(ctx, [text], args())
    const names = fake.calls.map((c) => c.name)
    // Pill first (rounded rect + fill), then per line stroke before fill.
    expect(names.indexOf('fill')).toBeLessThan(names.indexOf('strokeText'))
    expect(fake.named('strokeText').map((c) => c.args[0])).toEqual(['Hello', 'World'])
    expect(fake.named('fillText').map((c) => c.args[0])).toEqual(['Hello', 'World'])
    expect(names.indexOf('strokeText')).toBeLessThan(names.indexOf('fillText'))
    // Left aligned text starts at -w/2 + pad.
    const frame = layoutOverlay(ctx, text, args())!
    const pad = frame.fontPx * TEXT_PAD
    expect(fake.named('fillText')[0].args[1]).toBeCloseTo(-frame.width / 2 + pad)
    expect(fake.propValues('textAlign')).toContain('left')
    expect(fake.propValues('fillStyle')).toEqual(['#112233', '#ff0000'])
    expect(fake.propValues('strokeStyle')).toEqual(['#00ff00'])
    expect(fake.propValues('lineWidth')[0]).toBeCloseTo(frame.fontPx * 0.1)
    expect(fake.propValues('font').some((f) => String(f).startsWith('600 ') && String(f).includes('"Impact"'))).toBe(true)
  })

  it('does not stroke when the outline width is 0', () => {
    const { ctx, fake } = makeCtx()
    drawOverlays(ctx, [overlay({ kind: 'text', content: 'x', text: { font: 'Segoe UI', color: '#fff', outline: '#000', outlineWidth: 0, weight: 400, align: 'center' } })], args())
    expect(fake.named('strokeText')).toHaveLength(0)
    expect(fake.named('fillText')).toHaveLength(1)
  })

  it('draws images centred from the map and skips missing ones', () => {
    const { ctx, fake } = makeCtx()
    const img = { naturalWidth: 400, naturalHeight: 200 } as unknown as CanvasImageSource
    drawOverlays(ctx, [overlay({ kind: 'image', content: 'p', w: 0.5 }), overlay({ id: 'b', kind: 'image', content: 'missing' })], args({ images: new Map([['p', img]]) }))
    const draws = fake.named('drawImage')
    expect(draws).toHaveLength(1)
    expect(draws[0].args).toEqual([img, -480, -240, 960, 480])
  })

  it('filters by which and keeps pinned under unpinned', () => {
    const list = [overlay({ id: 'u', content: 'U' }), overlay({ id: 'p', content: 'P', pinned: true })]
    const pinned = makeCtx()
    drawOverlays(pinned.ctx, list, args({ which: 'pinned' }))
    expect(pinned.fake.named('fillText').map((c) => c.args[0])).toEqual(['P'])
    const unpinned = makeCtx()
    drawOverlays(unpinned.ctx, list, args({ which: 'unpinned' }))
    expect(unpinned.fake.named('fillText').map((c) => c.args[0])).toEqual(['U'])
    const all = makeCtx()
    drawOverlays(all.ctx, list, args())
    expect(all.fake.named('fillText').map((c) => c.args[0])).toEqual(['P', 'U'])
  })
})
