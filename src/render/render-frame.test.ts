import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT, type Overlay, type Project, type RecordingEvents, type ZoomSegment } from '../shared/types'

// The shared pure modules are mocked with small, honest reference implementations so
// this file tests the renderer's own math and draw order, not the planner/camera.
vi.mock('../shared/pointer', () => ({
  cameraPointerAt: (path: Array<[number, number, number]>) => path.length ? {x:path[0][1],y:path[0][2]} : null,
  smoothedPointerAt: (path: Array<[number, number, number]>, tSec: number) => {
    if (path.length === 0) return null
    const tMs = tSec * 1000
    let best = path[0]
    for (const p of path) if (Math.abs(p[0] - tMs) < Math.abs(best[0] - tMs)) best = p
    return { x: best[1], y: best[2] }
  },
  ripplesAt: (events: RecordingEvents, tSec: number, lifeSec = 0.5) =>
    events.clicks
      .filter((c) => c.down)
      .map((c) => ({ x: c.x, y: c.y, age: tSec - c.t / 1000, button: c.button }))
      .filter((r) => r.age >= 0 && r.age <= lifeSec)
}))

vi.mock('../shared/camera', () => ({
  cameraAt: (
    tSec: number,
    segments: ZoomSegment[],
    _pointer: { x: number; y: number } | null,
    region: { width: number; height: number }
  ) => {
    const seg = segments.find((s) => tSec >= s.start && tSec <= s.end)
    if (seg) return { cx: seg.x, cy: seg.y, scale: seg.scale, tiltX: seg.style === 'tilt-left' ? 12 : 0 }
    return { cx: region.width / 2, cy: region.height / 2, scale: 1 }
  }
}))

vi.mock('../shared/layout', () => ({
  effectiveTrim: (project: Project, duration: number) => ({ start: project.trim.start, end: project.trim.end || duration }),
  outputSize: () => ({ width: 1920, height: 1080 }),
  contentRect: (
    output: { width: number; height: number },
    source: { width: number; height: number },
    padding: number
  ) => {
    const pad = padding * Math.min(output.width, output.height)
    const availW = output.width - 2 * pad
    const availH = output.height - 2 * pad
    const s = Math.min(availW / source.width, availH / source.height)
    const w = source.width * s
    const h = source.height * s
    return { x: (output.width - w) / 2, y: (output.height - h) / 2, width: w, height: h }
  },
  webcamRect: (output: { width: number; height: number }, webcam: Project['webcam']) => {
    const size = webcam.size * Math.min(output.width, output.height)
    const margin = 24
    const x = webcam.corner.endsWith('r') ? output.width - margin - size : margin
    const y = webcam.corner.startsWith('b') ? output.height - margin - size : margin
    return { x, y, width: size, height: size }
  }
}))

import {
  applyEntranceAnimation,
  drawBackground,
  drawCursor,
  drawRipple,
  frameGeometry,
  frameOffset,
  pinMapping,
  renderFrame,
  videoToOutput,
  type Ctx2D,
  type FrameInput
} from './render-frame'
import { BRAND_CURSORS } from '../brand'
import { setKnightSprites } from '../brand'

// ---------------------------------------------------------------------------
// Minimal fake 2D context: records every method call and property assignment.

interface Call {
  name: string
  args: unknown[]
}

class FakeGradient {
  stops: Array<[number, string]> = []
  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color])
  }
}

class FakeContext {
  globalAlpha = 1
  calls: Call[] = []
  props: Array<[string, unknown]> = []
  gradients: FakeGradient[] = []
  canvas: { width: number; height: number }

  constructor(width: number, height: number) {
    this.canvas = { width, height }
  }

  private rec(name: string, ...args: unknown[]): void {
    this.calls.push({ name, args })
  }

  save(): void { this.rec('save') }
  restore(): void { this.rec('restore') }
  beginPath(): void { this.rec('beginPath') }
  closePath(): void { this.rec('closePath') }
  moveTo(x: number, y: number): void { this.rec('moveTo', x, y) }
  lineTo(x: number, y: number): void { this.rec('lineTo', x, y) }
  bezierCurveTo(...args: number[]): void { this.rec('bezierCurveTo', ...args) }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void { this.rec('arcTo', x1, y1, x2, y2, r) }
  arc(x: number, y: number, r: number, a0: number, a1: number): void { this.rec('arc', x, y, r, a0, a1) }
  rect(x: number, y: number, w: number, h: number): void { this.rec('rect', x, y, w, h) }
  fill(...args: unknown[]): void { this.rec('fill', ...args) }
  stroke(...args: unknown[]): void { this.rec('stroke', ...args) }
  clip(): void { this.rec('clip') }
  fillRect(x: number, y: number, w: number, h: number): void { this.rec('fillRect', x, y, w, h) }
  clearRect(...args: unknown[]): void { this.rec('clearRect', ...args) }
  drawImage(...args: unknown[]): void { this.rec('drawImage', ...args) }
  translate(x: number, y: number): void { this.rec('translate', x, y) }
  scale(x: number, y: number): void { this.rec('scale', x, y) }
  rotate(r: number): void { this.rec('rotate', r) }
  fillText(text: string, x: number, y: number): void { this.rec('fillText', text, x, y) }
  strokeText(text: string, x: number, y: number): void { this.rec('strokeText', text, x, y) }
  measureText(text: string): { width: number } {
    this.rec('measureText', text)
    return { width: text.length * 60 }
  }
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): FakeGradient {
    this.rec('createLinearGradient', x0, y0, x1, y1)
    const g = new FakeGradient()
    this.gradients.push(g)
    return g
  }

  named(name: string): Call[] {
    return this.calls.filter((c) => c.name === name)
  }
  propValues(name: string): unknown[] {
    return this.props.filter(([k]) => k === name).map(([, v]) => v)
  }
}

const METHODS = new Set(Object.getOwnPropertyNames(FakeContext.prototype))

describe('soft hand artwork', () => {
  it('anchors the fingertip and uses a warm porcelain gradient at every scale', () => {
    for (const size of [24, 48, 96]) {
      const { ctx, fake } = makeCtx(1920, 1080)
      drawCursor(ctx, 240, 160, size, 'hand')
      expect(fake.named('translate')[0].args).toEqual([240, 160])
      expect(fake.named('moveTo')[0].args).toEqual([0, 0])
      expect(fake.named('scale')[0].args).toEqual([size / 24, size / 24])
      expect(fake.gradients[0].stops).toEqual([[0, '#fffefa'], [0.6, '#f8f7f3'], [1, '#dedfe2']])
      expect(fake.named('save')).toHaveLength(fake.named('restore').length)
    }
  })
})

function makeCtx(width: number, height: number): { ctx: Ctx2D; fake: FakeContext } {
  const fake = new FakeContext(width, height)
  const proxy = new Proxy(fake, {
    set(target, key, value) {
      if (typeof key === 'string' && !METHODS.has(key) && key !== 'canvas') {
        target.props.push([key, value])
      }
      return Reflect.set(target, key, value)
    }
  })
  return { ctx: proxy as unknown as Ctx2D, fake }
}

// ---------------------------------------------------------------------------
// Fixtures

const VIDEO = { width: 1920, height: 1080 }
const fakeVideo = { width: 1920, height: 1080 } as unknown as CanvasImageSource
const fakeWebcam = { videoWidth: 640, videoHeight: 480 } as unknown as CanvasImageSource

function events(clicks: RecordingEvents['clicks'] = []): RecordingEvents {
  return {
    version: 1,
    startedAt: 0,
    region: { x: 0, y: 0, width: VIDEO.width, height: VIDEO.height, scale: 1 },
    pointer: [],
    clicks,
    wheel: [],
    keys: []
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    ...DEFAULT_PROJECT,
    // Plain frame so the expected geometry is easy to compute by hand.
    frame: { padding: 0.1, size: 1, radius: 0, shadow: 0, offsetX: 0, offsetY: 0 },
    cursor: { size: 1, smoothing: 0, ripple: false, style: 'arrow' },
    webcam: { ...DEFAULT_PROJECT.webcam, enabled: false },
    ...overrides
  }
}

function input(overrides: Partial<FrameInput> = {}): FrameInput {
  return {
    video: fakeVideo,
    videoSize: VIDEO,
    tSec: 0,
    events: events(),
    project: project(),
    segments: [],
    pointerPath: [],
    ...overrides
  }
}

// Output 1920x1080, padding 0.1 * 1080 = 108 → available 1704x864, height-limited, so
// the 16:9 video fits at 0.8 → 1536x864 centred.
const OUT = { width: 1920, height: 1080 }
const PAD = 108
const BASE = Math.min((1920 - 2 * PAD) / VIDEO.width, (1080 - 2 * PAD) / VIDEO.height)
const RECT_W = VIDEO.width * BASE
const RECT_H = VIDEO.height * BASE
const RECT = { x: (1920 - RECT_W) / 2, y: (1080 - RECT_H) / 2, width: RECT_W, height: RECT_H }

// ---------------------------------------------------------------------------

describe('videoToOutput', () => {
  const rect = { x: 100, y: 50, width: 960, height: 540 }

  it('scale 1 fills the rect exactly', () => {
    const m = videoToOutput({ cx: 960, cy: 540, scale: 1 }, VIDEO, rect)
    expect(m.scale).toBeCloseTo(0.5)
    expect(m.tx).toBeCloseTo(rect.x)
    expect(m.ty).toBeCloseTo(rect.y)
    expect(m.tx + m.scale * VIDEO.width).toBeCloseTo(rect.x + rect.width)
    expect(m.ty + m.scale * VIDEO.height).toBeCloseTo(rect.y + rect.height)
  })

  it('scale 1 ignores the focus (nothing to pan)', () => {
    const m = videoToOutput({ cx: 100, cy: 900, scale: 1 }, VIDEO, rect)
    expect(m.tx).toBeCloseTo(rect.x)
    expect(m.ty).toBeCloseTo(rect.y)
  })

  it('scale 2 puts the focus at the rect centre', () => {
    const cam = { cx: 700, cy: 400, scale: 2 }
    const m = videoToOutput(cam, VIDEO, rect)
    expect(m.scale).toBeCloseTo(1)
    expect(m.tx + m.scale * cam.cx).toBeCloseTo(rect.x + rect.width / 2)
    expect(m.ty + m.scale * cam.cy).toBeCloseTo(rect.y + rect.height / 2)
  })

  it('clamps so the video never leaves the rect', () => {
    const topLeft = videoToOutput({ cx: 0, cy: 0, scale: 2 }, VIDEO, rect)
    expect(topLeft.tx).toBeCloseTo(rect.x)
    expect(topLeft.ty).toBeCloseTo(rect.y)

    const bottomRight = videoToOutput({ cx: 1920, cy: 1080, scale: 2 }, VIDEO, rect)
    expect(bottomRight.tx + bottomRight.scale * VIDEO.width).toBeCloseTo(rect.x + rect.width)
    expect(bottomRight.ty + bottomRight.scale * VIDEO.height).toBeCloseTo(rect.y + rect.height)
  })

  it('centres the video when the camera scale is below 1', () => {
    const m = videoToOutput({ cx: 0, cy: 0, scale: 0.5 }, VIDEO, rect)
    expect(m.scale).toBeCloseTo(0.25)
    expect(m.tx).toBeCloseTo(rect.x + rect.width / 4)
    expect(m.ty).toBeCloseTo(rect.y + rect.height / 4)
  })

  it('treats a non-positive camera scale as 1', () => {
    const m = videoToOutput({ cx: 960, cy: 540, scale: 0 }, VIDEO, rect)
    expect(m.scale).toBeCloseTo(0.5)
    expect(m.tx).toBeCloseTo(rect.x)
  })
})

describe('drawBackground', () => {
  it('fills a gradient across the whole canvas with every colour stop', () => {
    const { ctx, fake } = makeCtx(200, 100)
    drawBackground(ctx, { width: 200, height: 100 }, { kind: 'gradient', colors: ['#000', '#888', '#fff'], angle: 90 })
    expect(fake.named('createLinearGradient')).toHaveLength(1)
    // angle 90 = left → right
    const [x0, y0, x1, y1] = fake.named('createLinearGradient')[0].args as number[]
    expect(x0).toBeCloseTo(0)
    expect(x1).toBeCloseTo(200)
    expect(y0).toBeCloseTo(50)
    expect(y1).toBeCloseTo(50)
    expect(fake.gradients[0].stops).toEqual([[0, '#000'], [0.5, '#888'], [1, '#fff']])
    expect(fake.named('fillRect')[0].args).toEqual([0, 0, 200, 100])
  })

  it('fills a solid colour', () => {
    const { ctx, fake } = makeCtx(200, 100)
    drawBackground(ctx, { width: 200, height: 100 }, { kind: 'solid', colors: ['#123456'], angle: 0 })
    expect(fake.propValues('fillStyle')).toEqual(['#123456'])
    expect(fake.named('fillRect')[0].args).toEqual([0, 0, 200, 100])
    expect(fake.named('createLinearGradient')).toHaveLength(0)
  })

  it('scales an image to cover', () => {
    const { ctx, fake } = makeCtx(100, 100)
    const img = { naturalWidth: 200, naturalHeight: 100 } as unknown as CanvasImageSource
    drawBackground(ctx, { width: 100, height: 100 }, { kind: 'image', colors: ['#000'], angle: 0, imagePath: 'x' }, img)
    const draw = fake.named('drawImage')
    expect(draw).toHaveLength(1)
    expect(draw[0].args).toEqual([img, -50, 0, 200, 100])
  })

  it('falls back to the gradient when the image is missing', () => {
    const { ctx, fake } = makeCtx(100, 100)
    drawBackground(ctx, { width: 100, height: 100 }, { kind: 'image', colors: ['#000', '#fff'], angle: 0 }, null)
    expect(fake.named('drawImage')).toHaveLength(0)
    expect(fake.named('createLinearGradient')).toHaveLength(1)
  })
})

describe('drawRipple', () => {
  it('draws nothing outside the lifetime', () => {
    const { ctx, fake } = makeCtx(100, 100)
    drawRipple(ctx, 10, 10, -0.1, 0.5, 40)
    drawRipple(ctx, 10, 10, 0.51, 0.5, 40)
    expect(fake.named('arc')).toHaveLength(0)
  })

  it('grows from 8 to 40 px for a 40 px ring and fades out', () => {
    const { ctx, fake } = makeCtx(100, 100)
    drawRipple(ctx, 10, 20, 0, 0.5, 40)
    drawRipple(ctx, 10, 20, 0.25, 0.5, 40)
    drawRipple(ctx, 10, 20, 0.5, 0.5, 40)
    const arcs = fake.named('arc')
    // The final frame has alpha 0 and is skipped; the first two are drawn.
    expect(arcs).toHaveLength(2)
    expect(arcs[0].args.slice(0, 3)).toEqual([10, 20, 8])
    const midRadius = arcs[1].args[2] as number
    expect(midRadius).toBeGreaterThan(8)
    expect(midRadius).toBeLessThan(40)
    const alphas = fake.propValues('globalAlpha') as number[]
    expect(alphas[0]).toBeCloseTo(0.8)
    expect(alphas[1]).toBeCloseTo(0.4)
  })
})

describe('applyEntranceAnimation', () => {
  function animated(style: Project['animation']['style'], durationSec = 1, strength = 1): Project {
    return project({ animation: { style, durationSec, strength } })
  }

  it('leaves the context untouched for none and completes at/after the duration', () => {
    const none = makeCtx(1000, 600)
    none.fake.globalAlpha = 1
    applyEntranceAnimation(none.ctx, animated('none'), 0, 600)
    expect(none.fake.calls).toEqual([])
    expect(none.fake.props).toEqual([])

    const end = makeCtx(1000, 600)
    end.fake.globalAlpha = 1
    applyEntranceAnimation(end.ctx, animated('fade'), 1, 600)
    applyEntranceAnimation(end.ctx, animated('fade'), 2, 600)
    expect(end.fake.propValues('globalAlpha').at(-2)).toBeCloseTo(1)
    expect(end.fake.propValues('globalAlpha').at(-1)).toBeCloseTo(1)
  })

  it('eases fade opacity from zero through the middle to one', () => {
    const alpha: number[] = []
    for (const tSec of [0, 0.5, 1]) {
      const fake = makeCtx(1000, 600)
      fake.fake.globalAlpha = 1
      applyEntranceAnimation(fake.ctx, animated('fade'), tSec, 600)
      alpha.push(fake.fake.propValues('globalAlpha')[0] as number)
    }
    expect(alpha[0]).toBeCloseTo(0)
    expect(alpha[1]).toBeGreaterThan(0)
    expect(alpha[1]).toBeLessThan(1)
    expect(alpha[2]).toBeCloseTo(1)
  })

  it('uses trim.start as the animation origin and bounds rise/scale transforms', () => {
    const rise = makeCtx(1000, 600)
    rise.fake.globalAlpha = 1
    const riseProject = animated('rise', 2, 0.5)
    riseProject.trim = { start: 3, end: 10 }
    applyEntranceAnimation(rise.ctx, riseProject, 3, 600)
    applyEntranceAnimation(rise.ctx, riseProject, 4, 600)
    applyEntranceAnimation(rise.ctx, riseProject, 5, 600)
    const riseTranslations = rise.fake.named('translate')
    expect(riseTranslations[0].args).toEqual([0, 600 * 0.08 * 0.5])
    expect(riseTranslations[1].args[1]).toBeGreaterThan(0)
    expect(riseTranslations[1].args[1]).toBeLessThan(riseTranslations[0].args[1] as number)
    expect(riseTranslations[2].args).toEqual([0, 0])

    const scale = makeCtx(1000, 600)
    scale.fake.globalAlpha = 1
    applyEntranceAnimation(scale.ctx, animated('scale', 1, 1), 0, 600)
    expect(scale.fake.named('translate').map((c) => c.args)).toEqual([[500, 300], [-500, -300]])
    expect(scale.fake.named('scale')[0].args[0]).toBeCloseTo(0.92)
  })
})

describe('renderFrame', () => {
  it('composes the complete mockup on one surface in unified mode without WebGL', () => {
    const allocated: Array<{ width: number; height: number; fake: FakeContext }> = []
    vi.stubGlobal('OffscreenCanvas', class {
      pair: ReturnType<typeof makeCtx>
      constructor(public width: number, public height: number) {
        this.pair = makeCtx(width, height)
        allocated.push({ width, height, fake: this.pair.fake })
      }
      getContext(kind: string) { return kind === '2d' ? this.pair.ctx : null }
    })
    try {
      const preview = makeCtx(OUT.width, OUT.height)
      const p = project({ mockup: { ...DEFAULT_PROJECT.mockup, kind: 'browser' }, zoom: { ...DEFAULT_PROJECT.zoom, perspective: 'unified' } })
      const frame = input({ project: p, tSec: 1, segments: [{ id: 'tilt', start: 0, end: 3, x: 960, y: 540, scale: 2, source: 'manual', style: 'tilt-left' }] })
      const geometry = frameGeometry(frame, OUT)
      renderFrame(preview.ctx, frame)
      expect(allocated[0].width).toBe(Math.round(geometry.outer.width))
      expect(allocated[0].height).toBe(Math.round(geometry.outer.height))
      expect(allocated[0].fake.named('translate')[0].args).toEqual([-geometry.outer.x, -geometry.outer.y])
      // Browser title-bar dots belong to the offscreen card, never the flat output.
      expect(allocated[0].fake.named('arc').length).toBeGreaterThanOrEqual(3)
      expect(preview.fake.named('arc')).toHaveLength(0)
    } finally { vi.unstubAllGlobals() }
  })
  it('keeps tilted preview scratch canvases separate from export, while reusing each owner buffer', () => {
    const allocated: unknown[] = []
    vi.stubGlobal('OffscreenCanvas', class {
      context: Ctx2D
      constructor(public width: number, public height: number) {
        this.context = makeCtx(width, height).ctx
        allocated.push(this)
      }
      getContext() { return this.context }
    })
    try {
      const preview = makeCtx(OUT.width, OUT.height)
      const exported = makeCtx(OUT.width, OUT.height)
      const frame = input({ tSec: 1, segments: [{ id: 'tilt', start: 0, end: 3, x: 960, y: 540, scale: 2, source: 'manual', style: 'tilt-left' }] })
      renderFrame(preview.ctx, frame)
      renderFrame(exported.ctx, frame)
      renderFrame(preview.ctx, frame)
      renderFrame(exported.ctx, frame)
      expect(allocated).toHaveLength(2)
      expect(preview.fake.named('drawImage')[0].args[0]).toBe(allocated[0])
      expect(exported.fake.named('drawImage')[0].args[0]).toBe(allocated[1])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('draws nothing for a zero-size video', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input({ videoSize: { width: 0, height: 0 } }))
    expect(fake.calls).toHaveLength(0)
    expect(fake.props).toHaveLength(0)
  })

  it('restores the canvas state after an animated frame, including an empty rect', () => {
    const drawn = makeCtx(OUT.width, OUT.height)
    renderFrame(drawn.ctx, input({ project: project({ animation: { style: 'fade', durationSec: 1, strength: 1 } }) }))
    expect(drawn.fake.named('save').length).toBeGreaterThan(0)
    expect(drawn.fake.named('restore').length).toBe(drawn.fake.named('save').length)
    const firstSave = drawn.fake.calls.findIndex((call) => call.name === 'save')
    expect(firstSave).toBeGreaterThan(drawn.fake.calls.findIndex((call) => call.name === 'fillRect'))
    expect(drawn.fake.calls.at(-1)?.name).toBe('restore')

    const empty = makeCtx(OUT.width, OUT.height)
    renderFrame(empty.ctx, input({ project: project({
      animation: { style: 'rise', durationSec: 1, strength: 1 },
      frame: { padding: 1, size: 1, radius: 0, shadow: 0, offsetX: 0, offsetY: 0 }
    }) }))
    expect(empty.fake.named('save')).toHaveLength(1)
    expect(empty.fake.named('restore')).toHaveLength(1)
  })

  it('draws the video into the content rect at camera scale 1', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input())
    const draws = fake.named('drawImage')
    expect(draws).toHaveLength(1)
    const [src, sx, sy, sw, sh, x, y, w, h] = draws[0].args as [unknown, number, number, number, number, number, number, number, number]
    expect(src).toBe(fakeVideo)
    expect(sx).toBe(0)
    expect(sy).toBe(0)
    expect(sw).toBe(VIDEO.width)
    expect(sh).toBe(VIDEO.height)
    expect(x).toBeCloseTo(RECT.x)
    expect(y).toBeCloseTo(RECT.y)
    expect(w).toBeCloseTo(RECT.width)
    expect(h).toBeCloseTo(RECT.height)
    // Background was painted first, and the video sits inside a clip.
    const order = fake.calls.map((c) => c.name)
    expect(order.indexOf('fillRect')).toBeLessThan(order.indexOf('clip'))
    expect(order.indexOf('clip')).toBeLessThan(order.indexOf('drawImage'))
    expect(fake.propValues('imageSmoothingQuality')).toContain('high')
  })

  it('draws the video scaled about the zoom focus inside a segment', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    const seg: ZoomSegment = { id: 'z', start: 1, end: 3, x: 1600, y: 300, scale: 2, source: 'auto' }
    renderFrame(ctx, input({ tSec: 2, segments: [seg] }))
    const [, , , , , x, y, w, h] = fake.named('drawImage')[0].args as [unknown, number, number, number, number, number, number, number, number]
    expect(w).toBeCloseTo(RECT.width * 2)
    expect(h).toBeCloseTo(RECT.height * 2)
    // The focus lands on the rect centre unless clamped; 1600 is far enough right to
    // be clamped on x, 300 is fine on y.
    expect(x + BASE * 2 * 1920).toBeCloseTo(RECT.x + RECT.width)
    expect(y + BASE * 2 * 300).toBeCloseTo(RECT.y + RECT.height / 2)
  })

  it('draws the cursor at the mapped pointer position', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input({ tSec: 0.5, pointerPath: [[500, 400, 300]] }))
    const translates = fake.named('translate')
    expect(translates).toHaveLength(1)
    const [x, y] = translates[0].args as [number, number]
    expect(x).toBeCloseTo(RECT.x + BASE * 400)
    expect(y).toBeCloseTo(RECT.y + BASE * 300)
    // Arrow sprite is 32 * size * mapping.scale.
    const [sx, sy] = fake.named('scale')[0].args as [number, number]
    expect(sx).toBeCloseTo(32 * BASE)
    expect(sy).toBeCloseTo(32 * BASE)
    // Tip of the arrow sits at the hotspot.
    expect(fake.named('moveTo').some((c) => c.args[0] === 0 && c.args[1] === 0)).toBe(true)
  })

  it('draws a dot cursor scaled by cursor.size', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(
      ctx,
      input({
        pointerPath: [[0, 100, 100]],
        project: project({ cursor: { size: 2, smoothing: 0, ripple: false, style: 'dot' } })
      })
    )
    const arcs = fake.named('arc')
    expect(arcs).toHaveLength(1)
    expect(arcs[0].args[2]).toBeCloseTo(32 * 2 * BASE * 0.3)
  })

  // Only a build with a sprite pack has this pointer at all.
  it.skipIf(BRAND_CURSORS.length === 0)('keeps the pack sprite pointer at a stable screen size while the camera zooms', () => {
    const sprite = {} as CanvasImageSource
    setKnightSprites({ idle: sprite })
    try {
      const normal = makeCtx(OUT.width, OUT.height)
      renderFrame(normal.ctx, input({
        tSec: 0.5,
        pointerPath: [[500, 400, 300]],
        project: project({ cursor: { size: 1.4, smoothing: 0, ripple: false, style: 'sprite' } })
      }))

      const zoomed = makeCtx(OUT.width, OUT.height)
      renderFrame(zoomed.ctx, input({
        tSec: 2,
        pointerPath: [[2000, 400, 300]],
        segments: [{ id: 'z', start: 1, end: 3, x: 400, y: 300, scale: 2, source: 'auto' }],
        project: project({ cursor: { size: 1.4, smoothing: 0, ripple: false, style: 'sprite' } })
      }))

      const normalKnight = normal.fake.named('drawImage').find((call) => call.args[0] === sprite)
      const zoomedKnight = zoomed.fake.named('drawImage').find((call) => call.args[0] === sprite)
      expect(normalKnight).toBeDefined()
      expect(zoomedKnight).toBeDefined()
      expect(zoomedKnight?.args[3]).toBeCloseTo(normalKnight?.args[3] as number)
      expect(zoomedKnight?.args[4]).toBeCloseTo(normalKnight?.args[4] as number)
    } finally {
      setKnightSprites({})
    }
  })

  it('skips the cursor when there is no pointer sample', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input({ pointerPath: [] }))
    expect(fake.named('translate')).toHaveLength(0)
  })

  it('draws ripples only within their lifetime, at the mapped click position', () => {
    const clickEvents = events([{ t: 1000, x: 800, y: 600, button: 'left', down: true }])
    const proj = project({ cursor: { size: 1, smoothing: 0, ripple: true, style: 'arrow' } })

    const live = makeCtx(OUT.width, OUT.height)
    renderFrame(live.ctx, input({ tSec: 1.2, events: clickEvents, project: proj }))
    const arcs = live.fake.named('arc')
    expect(arcs).toHaveLength(1)
    expect(arcs[0].args[0]).toBeCloseTo(RECT.x + BASE * 800)
    expect(arcs[0].args[1]).toBeCloseTo(RECT.y + BASE * 600)
    const radius = arcs[0].args[2] as number
    expect(radius).toBeGreaterThan(8 * BASE)
    expect(radius).toBeLessThanOrEqual(40 * BASE)

    const before = makeCtx(OUT.width, OUT.height)
    renderFrame(before.ctx, input({ tSec: 0.9, events: clickEvents, project: proj }))
    expect(before.fake.named('arc')).toHaveLength(0)

    const after = makeCtx(OUT.width, OUT.height)
    renderFrame(after.ctx, input({ tSec: 2, events: clickEvents, project: proj }))
    expect(after.fake.named('arc')).toHaveLength(0)
  })

  it('does not draw ripples when the option is off', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    const clickEvents = events([{ t: 1000, x: 800, y: 600, button: 'left', down: true }])
    renderFrame(ctx, input({ tSec: 1.2, events: clickEvents }))
    expect(fake.named('arc')).toHaveLength(0)
  })

  it('skips the webcam when disabled and draws it cover-fit when enabled', () => {
    const off = makeCtx(OUT.width, OUT.height)
    renderFrame(off.ctx, input({ webcam: fakeWebcam }))
    expect(off.fake.named('drawImage')).toHaveLength(1)

    const noSource = makeCtx(OUT.width, OUT.height)
    renderFrame(noSource.ctx, input({ webcam: null, project: project({ webcam: { ...DEFAULT_PROJECT.webcam, enabled: true } }) }))
    expect(noSource.fake.named('drawImage')).toHaveLength(1)

    const on = makeCtx(OUT.width, OUT.height)
    renderFrame(
      on.ctx,
      input({
        webcam: fakeWebcam,
        project: project({ webcam: { enabled: true, corner: 'br', size: 0.2, round: true } })
      })
    )
    const draws = on.fake.named('drawImage')
    expect(draws).toHaveLength(2)
    expect(draws[1].args[0]).toBe(fakeWebcam)
    // webcamRect (mock): 216px square at bottom-right with a 24px margin.
    const size = 0.2 * 1080
    const bx = 1920 - 24 - size
    const by = 1080 - 24 - size
    // The cover fit is done by cropping the sensor rather than by overflowing
    // the destination and leaning on the clip, so this is a 9-argument draw:
    // the centred 480x480 slice of a 640x480 camera, landing exactly on the bubble.
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = draws[1].args as [unknown, ...number[]]
    expect(sw).toBeCloseTo(480)
    expect(sh).toBeCloseTo(480)
    expect(sx).toBeCloseTo(80)
    expect(sy).toBeCloseTo(0)
    expect(dx).toBeCloseTo(bx)
    expect(dy).toBeCloseTo(by)
    expect(dw).toBeCloseTo(size)
    expect(dh).toBeCloseTo(size)
    // The webcam is drawn after the content clip is released and inside its own clip.
    const names = on.fake.calls.map((c) => c.name)
    const secondDraw = names.lastIndexOf('drawImage')
    const clipsBefore = names.slice(0, secondDraw).filter((n) => n === 'clip').length
    expect(clipsBefore).toBe(2)
  })

  it('paints a shadow under the content when frame.shadow > 0', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input({ project: project({ frame: { padding: 0.1, size: 1, radius: 16, shadow: 0.5, offsetX: 0, offsetY: 0 } }) }))
    const blur = fake.propValues('shadowBlur') as number[]
    expect(blur).toHaveLength(1)
    expect(blur[0]).toBeCloseTo(0.5 * 1080 * 0.08)
    // Rounded corners use arcTo with the requested radius.
    expect(fake.named('arcTo').every((c) => c.args[4] === 16)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Overlays

function sticker(over: Partial<Overlay> = {}): Overlay {
  return { id: 's', kind: 'emoji', content: '🔥', x: 0.5, y: 0.5, w: 0.2, rotation: 0, start: 0, end: 0, pinned: false, fadeSec: 0, ...over }
}

describe('renderFrame overlays', () => {
  it('draws project.overlays by default and the explicit list when given', () => {
    const fromProject = makeCtx(OUT.width, OUT.height)
    renderFrame(fromProject.ctx, input({ project: project({ overlays: [sticker({ content: 'P' })] }) }))
    expect(fromProject.fake.named('fillText').map((c) => c.args[0])).toEqual(['P'])

    const explicit = makeCtx(OUT.width, OUT.height)
    renderFrame(explicit.ctx, input({ project: project({ overlays: [sticker({ content: 'P' })] }), overlays: [sticker({ content: 'E' })] }))
    expect(explicit.fake.named('fillText').map((c) => c.args[0])).toEqual(['E'])
  })

  it('draws unpinned overlays after the webcam and pinned ones inside the content clip, under the cursor', () => {
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(
      ctx,
      input({
        tSec: 0.5,
        pointerPath: [[500, 400, 300]],
        webcam: fakeWebcam,
        project: project({
          webcam: { enabled: true, corner: 'br', size: 0.2, round: true },
          overlays: [sticker({ id: 'u', content: 'U' }), sticker({ id: 'p', content: 'P', pinned: true })]
        })
      })
    )
    const names = fake.calls.map((c) => c.name)
    const fills = fake.named('fillText').map((c) => c.args[0])
    expect(fills).toEqual(['P', 'U'])
    const pIdx = fake.calls.findIndex((c) => c.name === 'fillText' && c.args[0] === 'P')
    const uIdx = fake.calls.findIndex((c) => c.name === 'fillText' && c.args[0] === 'U')
    const clipIdx = names.indexOf('clip')
    const cursorIdx = names.indexOf('scale') // the arrow sprite is the only ctx.scale call
    const webcamDraw = names.lastIndexOf('drawImage')
    expect(pIdx).toBeGreaterThan(clipIdx)
    expect(pIdx).toBeLessThan(cursorIdx)
    expect(uIdx).toBeGreaterThan(webcamDraw)
  })

  it('skips overlays outside their time range and honours overlaysIgnoreTime', () => {
    const off = makeCtx(OUT.width, OUT.height)
    renderFrame(off.ctx, input({ tSec: 5, project: project({ overlays: [sticker({ start: 1, end: 2 })] }) }))
    expect(off.fake.named('fillText')).toHaveLength(0)
    const all = makeCtx(OUT.width, OUT.height)
    renderFrame(all.ctx, input({ tSec: 5, overlaysIgnoreTime: true, project: project({ overlays: [sticker({ start: 1, end: 2 })] }) }))
    expect(all.fake.named('fillText')).toHaveLength(1)
  })

  it('positions a pinned overlay through the camera and scales it by the zoom', () => {
    const seg: ZoomSegment = { id: 'z', start: 1, end: 3, x: 960, y: 540, scale: 2, source: 'auto' }
    const base = makeCtx(OUT.width, OUT.height)
    renderFrame(base.ctx, input({ tSec: 2, segments: [seg], project: project({ overlays: [sticker({ x: 0.25, y: 0.25, pinned: true })] }) }))
    const [tx, ty] = base.fake.named('translate')[0].args as [number, number]
    // Authored at (0.25, 0.25) of the output at scale 1; the camera centred at the video
    // middle with scale 2 pushes it outward by 2x from the centre.
    expect(tx).toBeCloseTo(960 + (0.25 * 1920 - 960) * 2)
    expect(ty).toBeCloseTo(540 + (0.25 * 1080 - 540) * 2)
    const font = base.fake.propValues('font').find((f) => String(f).includes('Segoe UI Emoji')) as string
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)![1])
    // Unpinned at the same size would be 100 * 384 / 120 px; pinned doubles it.
    expect(px).toBeCloseTo((2 * 100 * 0.2 * 1920) / ('🔥'.length * 60), 0)
  })
})

describe('frameGeometry / pinMapping', () => {
  it('maps a screen-space point at scale 1 to itself and doubles offsets at scale 2', () => {
    const g1 = frameGeometry({ videoSize: VIDEO, project: project(), tSec: 0, segments: [], pointerPath: [] }, OUT)
    const m1 = pinMapping(g1.base, g1.mapping, OUT)
    expect(m1(0.3, 0.7)).toMatchObject({ x: 0.3 * 1920, y: 0.7 * 1080, scale: 1 })
    const seg: ZoomSegment = { id: 'z', start: 0, end: 3, x: 960, y: 540, scale: 2, source: 'auto' }
    const g2 = frameGeometry({ videoSize: VIDEO, project: project(), tSec: 1, segments: [seg], pointerPath: [] }, OUT)
    const m2 = pinMapping(g2.base, g2.mapping, OUT)
    const p = m2(0.5, 0.5)
    expect(p.x).toBeCloseTo(960)
    expect(p.y).toBeCloseTo(540)
    expect(p.scale).toBeCloseTo(2)
  })

  it('shifts frame geometry by the persisted output-relative offset', () => {
    const offset = { x: 0.1, y: -0.05 }
    const g = frameGeometry(
      { videoSize: VIDEO, project: project({ frame: { padding: 0.1, size: 1, radius: 0, shadow: 0, offsetX: offset.x, offsetY: offset.y } }), tSec: 0, segments: [], pointerPath: [] },
      OUT
    )
    expect(g.rect.x).toBeCloseTo(RECT.x + offset.x * OUT.width)
    expect(g.rect.y).toBeCloseTo(RECT.y + offset.y * OUT.height)
    expect(g.rect.width).toBeCloseTo(RECT.width)
    expect(g.rect.height).toBeCloseTo(RECT.height)
  })

  it('renders the video using the same shifted geometry returned by frameGeometry', () => {
    const proj = project({ frame: { padding: 0.1, size: 1, radius: 0, shadow: 0, offsetX: 0.1, offsetY: -0.05 } })
    const expected = frameGeometry({ videoSize: VIDEO, project: proj, tSec: 0, segments: [], pointerPath: [] }, OUT)
    const { ctx, fake } = makeCtx(OUT.width, OUT.height)
    renderFrame(ctx, input({ project: proj }))
    const [, , , , , x, y, w, h] = fake.named('drawImage')[0].args as [unknown, number, number, number, number, number, number, number, number]
    expect(x).toBeCloseTo(expected.mapping.tx)
    expect(y).toBeCloseTo(expected.mapping.ty)
    expect(w).toBeCloseTo(expected.mapping.scale * VIDEO.width)
    expect(h).toBeCloseTo(expected.mapping.scale * VIDEO.height)
  })
})
