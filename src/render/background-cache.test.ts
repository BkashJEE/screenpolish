import { afterEach, expect, it, vi } from 'vitest'
import { renderBackground, type Ctx2D, type FrameInput } from './render-frame'
import { DEFAULT_PROJECT } from '../shared/types'

afterEach(() => vi.unstubAllGlobals())
it('reuses static blur, invalidates edits, and isolates export buffers', () => {
  let paints = 0
  const target = () => ({ save() {}, restore() {}, translate() {}, scale() {}, clearRect() {}, fillRect() { paints++ } })
  vi.stubGlobal('OffscreenCanvas', class {
    constructor(public width: number, public height: number) {}
    getContext() { return target() }
  })
  const ctx = { drawImage: vi.fn() } as unknown as Ctx2D
  const input = { project: { ...DEFAULT_PROJECT, background: { kind: 'solid', colors: ['#123456'], angle: 0, blur: 20 } } } as FrameInput
  renderBackground(ctx, { width: 1920, height: 1080 }, input)
  renderBackground(ctx, { width: 1920, height: 1080 }, input)
  expect(paints).toBe(1)
  input.project.background.colors = ['#654321']
  renderBackground(ctx, { width: 1920, height: 1080 }, input)
  expect(paints).toBe(2)
  const exported = { drawImage: vi.fn() } as unknown as Ctx2D
  renderBackground(exported, { width: 1920, height: 1080 }, input)
  expect(paints).toBe(3)
  expect(vi.mocked(ctx.drawImage).mock.calls[0][0]).not.toBe(vi.mocked(exported.drawImage).mock.calls[0][0])
})
