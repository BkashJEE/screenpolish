import { afterEach, describe, expect, it } from 'vitest'
import { drawCutTransition, holdFrame } from './cut-transition'
import { heldOpacity, transitionBlurPx } from '../shared/cut-transition'
import type { Ctx2D } from './render-frame'

// Fake 2D context recording the calls and the state each draw ran under, so the
// compositing can be asserted without a real canvas.

interface Draw {
  alpha: number
  filter: string
  args: unknown[]
}

class FakeContext {
  canvas: { width: number; height: number }
  globalAlpha = 1
  filter = 'none'
  draws: Draw[] = []
  cleared = 0
  private stack: Array<{ alpha: number; filter: string }> = []

  constructor(width = 1920, height = 1080) {
    this.canvas = { width, height }
  }
  save() {
    this.stack.push({ alpha: this.globalAlpha, filter: this.filter })
  }
  restore() {
    const previous = this.stack.pop()
    if (previous) {
      this.globalAlpha = previous.alpha
      this.filter = previous.filter
    }
  }
  clearRect() {
    this.cleared += 1
  }
  drawImage(...args: unknown[]) {
    this.draws.push({ alpha: this.globalAlpha, filter: this.filter, args })
  }
  getContext() {
    return this
  }
}

const ctxOf = (fake: FakeContext) => fake as unknown as Ctx2D
const HELD = { held: true } as unknown as CanvasImageSource

/** Minimal OffscreenCanvas so the blur path's scratch surface exists under node. */
function withOffscreenCanvas(run: () => void): void {
  class StubOffscreenCanvas extends FakeContext {}
  ;(globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = StubOffscreenCanvas
  try {
    run()
  } finally {
    delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas
  }
}

afterEach(() => {
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas
})

describe('drawCutTransition', () => {
  it('draws nothing for a hard cut', () => {
    const fake = new FakeContext()
    drawCutTransition(ctxOf(fake), HELD, 0, 'none')
    expect(fake.draws).toEqual([])
  })

  it('draws nothing on a canvas with no size', () => {
    const fake = new FakeContext(0, 0)
    drawCutTransition(ctxOf(fake), HELD, 0, 'dissolve')
    expect(fake.draws).toEqual([])
  })

  it('dissolve draws the held frame at the eased opacity and leaves the state clean', () => {
    const fake = new FakeContext()
    drawCutTransition(ctxOf(fake), HELD, 0.25, 'dissolve')
    expect(fake.draws).toHaveLength(1)
    expect(fake.draws[0].alpha).toBeCloseTo(heldOpacity(0.25), 6)
    expect(fake.draws[0].args).toEqual([HELD, 0, 0, 1920, 1080])
    expect(fake.globalAlpha).toBe(1)
  })

  it('dissolve fades: later in the transition is fainter', () => {
    const early = new FakeContext()
    const late = new FakeContext()
    drawCutTransition(ctxOf(early), HELD, 0.2, 'dissolve')
    drawCutTransition(ctxOf(late), HELD, 0.8, 'dissolve')
    expect(late.draws[0].alpha).toBeLessThan(early.draws[0].alpha)
  })

  it('dissolve stops drawing once the transition is over', () => {
    const fake = new FakeContext()
    drawCutTransition(ctxOf(fake), HELD, 1, 'dissolve')
    expect(fake.draws).toEqual([])
  })

  it('blur composites into a scratch, then draws it back blurred and overscanned', () => {
    withOffscreenCanvas(() => {
      const fake = new FakeContext()
      drawCutTransition(ctxOf(fake), HELD, 0, 'blur')
      // Last draw is the one onto the real context.
      const final = fake.draws.at(-1)!
      const blur = transitionBlurPx(0, 1080)
      expect(final.filter).toBe(`blur(${blur.toFixed(2)}px)`)
      const grow = blur * 3
      expect(final.args.slice(1)).toEqual([-grow, -grow, 1920 + grow * 2, 1080 + grow * 2])
      // The filter is scoped to that draw.
      expect(fake.filter).toBe('none')
    })
  })

  it('blur clears at the end of the transition, so nothing is drawn', () => {
    withOffscreenCanvas(() => {
      const fake = new FakeContext()
      drawCutTransition(ctxOf(fake), HELD, 1, 'blur')
      expect(fake.draws).toEqual([])
    })
  })

  it('blur falls back to a plain dissolve where there is no scratch surface', () => {
    const fake = new FakeContext()
    drawCutTransition(ctxOf(fake), HELD, 0.3, 'blur')
    expect(fake.draws).toHaveLength(1)
    expect(fake.draws[0].filter).toBe('none')
    expect(fake.draws[0].alpha).toBeCloseTo(heldOpacity(0.3), 6)
  })
})

describe('holdFrame', () => {
  it('returns nothing without a scratch surface, so callers skip the transition', () => {
    expect(holdFrame(ctxOf(new FakeContext()))).toBeNull()
  })

  it('returns nothing for a canvas with no size', () => {
    withOffscreenCanvas(() => {
      expect(holdFrame(ctxOf(new FakeContext(0, 0)))).toBeNull()
    })
  })

  it('copies the current frame into a surface of the same size', () => {
    withOffscreenCanvas(() => {
      const fake = new FakeContext(1280, 720)
      const held = holdFrame(ctxOf(fake)) as unknown as FakeContext | null
      expect(held).not.toBeNull()
      expect(held!.canvas).toEqual({ width: 1280, height: 720 })
      expect(held!.draws).toHaveLength(1)
      expect(held!.draws[0].args[0]).toBe(fake.canvas)
    })
  })
})
