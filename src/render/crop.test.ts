import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT, type Project, type RecordingEvents, type ZoomSegment } from '../shared/types'

vi.mock('../shared/pointer', () => ({
  cameraPointerAt: (path: Array<[number, number, number]>) => path.length ? {x:path[0][1],y:path[0][2]} : null,
  smoothedPointerAt: (path: Array<[number, number, number]>, tSec: number) => {
    if (path.length === 0) return null
    const sample = path.reduce((best, current) => Math.abs(current[0] - tSec * 1000) < Math.abs(best[0] - tSec * 1000) ? current : best)
    return { x: sample[1], y: sample[2] }
  },
  ripplesAt: () => []
}))

vi.mock('../shared/camera', () => ({
  cameraAt: (_t: number, segments: ZoomSegment[], _pointer: unknown, region: { width: number; height: number }) => {
    const segment = segments[0]
    return segment ? { cx: segment.x, cy: segment.y, scale: segment.scale } : { cx: region.width / 2, cy: region.height / 2, scale: 1 }
  }
}))

vi.mock('../shared/layout', () => ({
  contentRect: (output: { width: number; height: number }, source: { width: number; height: number }, padding: number) => {
    const pad = padding * Math.min(output.width, output.height)
    const availableW = output.width - pad * 2
    const availableH = output.height - pad * 2
    const scale = Math.min(availableW / source.width, availableH / source.height)
    const width = source.width * scale
    const height = source.height * scale
    return { x: (output.width - width) / 2, y: (output.height - height) / 2, width, height }
  },
  webcamRect: () => ({ x: 0, y: 0, width: 0, height: 0 })
}))

import { cropToSourceRect, frameGeometry, renderFrame, sourceToCroppedPoint } from './render-frame'
import type { Ctx2D, FrameInput } from './render-frame'

interface Call { name: string; args: unknown[] }

class FakeContext {
  canvas: { width: number; height: number }
  calls: Call[] = []
  constructor(width: number, height: number) { this.canvas = { width, height } }
  private rec(name: string, ...args: unknown[]): void { this.calls.push({ name, args }) }
  save(): void { this.rec('save') }
  restore(): void { this.rec('restore') }
  beginPath(): void { this.rec('beginPath') }
  closePath(): void { this.rec('closePath') }
  moveTo(x: number, y: number): void { this.rec('moveTo', x, y) }
  arcTo(...args: number[]): void { this.rec('arcTo', ...args) }
  rect(...args: number[]): void { this.rec('rect', ...args) }
  clip(): void { this.rec('clip') }
  fill(): void { this.rec('fill') }
  stroke(): void { this.rec('stroke') }
  fillRect(...args: number[]): void { this.rec('fillRect', ...args) }
  drawImage(...args: unknown[]): void { this.rec('drawImage', ...args) }
  translate(...args: number[]): void { this.rec('translate', ...args) }
  scale(...args: number[]): void { this.rec('scale', ...args) }
  arc(...args: number[]): void { this.rec('arc', ...args) }
  createLinearGradient(): { addColorStop(): void } { return { addColorStop() {} } }
  named(name: string): Call[] { return this.calls.filter((call) => call.name === name) }
}

const videoSize = { width: 1920, height: 1080 }
const video = { width: videoSize.width, height: videoSize.height } as unknown as CanvasImageSource
const output = { width: 1920, height: 1080 }

function project(overrides: Partial<Project> = {}): Project {
  return {
    ...DEFAULT_PROJECT,
    crop: { ...DEFAULT_PROJECT.crop },
    frame: { padding: 0.1, size: 1, radius: 0, shadow: 0, offsetX: 0, offsetY: 0 },
    cursor: { size: 0, smoothing: 0, ripple: false, style: 'arrow' },
    webcam: { ...DEFAULT_PROJECT.webcam, enabled: false },
    ...overrides
  }
}

function events(): RecordingEvents {
  return { version: 1, startedAt: 0, region: { x: 0, y: 0, ...videoSize, scale: 1 }, pointer: [], clicks: [], wheel: [], keys: [] }
}

function input(overrides: Partial<FrameInput> = {}): FrameInput {
  return { video, videoSize, tSec: 0, events: events(), project: project(), segments: [], pointerPath: [], ...overrides }
}

function context(): { ctx: Ctx2D; fake: FakeContext } {
  const fake = new FakeContext(output.width, output.height)
  const proxy = new Proxy(fake, { set(target, key, value) { Reflect.set(target, key, value); return true } })
  return { ctx: proxy as unknown as Ctx2D, fake }
}

describe('crop source-coordinate helpers', () => {
  it('converts normalized crop coordinates to original source pixels', () => {
    expect(cropToSourceRect({ x: 0.25, y: 0.1, width: 0.5, height: 0.75 }, videoSize)).toEqual({ x: 480, y: 108, width: 960, height: 810 })
  })

  it('maps points into cropped-local space and preserves the full crop', () => {
    const crop = cropToSourceRect({ x: 0.25, y: 0.1, width: 0.5, height: 0.75 }, videoSize)
    expect(sourceToCroppedPoint({ x: 1440, y: 918 }, crop)).toEqual({ x: 960, y: 810 })
    const full = cropToSourceRect(DEFAULT_PROJECT.crop, videoSize)
    expect(sourceToCroppedPoint({ x: 777, y: 333 }, full)).toEqual({ x: 777, y: 333 })
  })
})

describe('crop rendering', () => {
  it('draws an off-center crop from the original source into the cropped frame', () => {
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.75 }
    const proj = project({ crop })
    const expected = frameGeometry({ videoSize, project: proj, tSec: 0, segments: [], pointerPath: [] }, output)
    const { ctx, fake } = context()

    renderFrame(ctx, input({ project: proj }))

    expect(fake.named('drawImage')).toHaveLength(1)
    expect(fake.named('drawImage')[0].args).toEqual([
      video, 480, 108, 960, 810,
      expected.mapping.tx, expected.mapping.ty,
      expected.mapping.scale * 960, expected.mapping.scale * 810
    ])
  })

  it('maps original-source zoom focus coordinates back through an off-center crop', () => {
    const proj = project({ crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.75 } })
    const segment: ZoomSegment = { id: 'crop-zoom', start: 0, end: 1, x: 1200, y: 540, scale: 2, source: 'manual' }
    const geometry = frameGeometry({ videoSize, project: proj, tSec: 0.5, segments: [segment], pointerPath: [] }, output)

    expect(geometry.camera.cx).toBe(720)
    expect(geometry.camera.cy).toBe(432)
    expect(geometry.mapping.tx + geometry.mapping.scale * geometry.camera.cx).toBeCloseTo(geometry.rect.x + geometry.rect.width / 2)
    expect(geometry.mapping.ty + geometry.mapping.scale * geometry.camera.cy).toBeCloseTo(geometry.rect.y + geometry.rect.height / 2)
  })

  it('registers mockup content at the cropped source aspect', () => {
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.75 }
    for (const kind of ['browser', 'phone'] as const) {
      const geometry = frameGeometry({ videoSize, project: project({ crop, mockup: { ...DEFAULT_PROJECT.mockup, kind } }), tSec: 0, segments: [], pointerPath: [] }, output)
      expect(geometry.rect.width / geometry.rect.height).toBeCloseTo((960 / 810), 10)
    }
  })
})
