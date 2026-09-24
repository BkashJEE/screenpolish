import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT, type Project } from '../shared/types'
import { frameGeometry, frameSize } from './render-frame'

const output = { width: 1920, height: 1080 }
const videoSize = { width: 1920, height: 1080 }

function projectWith(frame: Partial<Project['frame']>, mockup: Partial<Project['mockup']> = {}): Project {
  return {
    ...DEFAULT_PROJECT,
    frame: { ...DEFAULT_PROJECT.frame, ...frame },
    mockup: { ...DEFAULT_PROJECT.mockup, ...mockup },
    zoom: { ...DEFAULT_PROJECT.zoom, enabled: false }
  }
}

function center(rect: { x: number; y: number; width: number; height: number }) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

describe('frame screen size', () => {
  it('uses one as the default and clamps invalid or out-of-bounds values', () => {
    expect(frameSize(projectWith({ size: Number.NaN }))).toBe(1)
    expect(frameSize(projectWith({ size: 0 }))).toBe(0.5)
    expect(frameSize(projectWith({ size: 2 }))).toBe(1.5)
  })

  it('scales around the outer center while retaining the frame offset', () => {
    const base = frameGeometry({ videoSize, project: projectWith({ size: 1, offsetX: 0.07, offsetY: -0.04 }), tSec: 0, segments: [], pointerPath: [] }, output)
    const scaled = frameGeometry({ videoSize, project: projectWith({ size: 1.25, offsetX: 0.07, offsetY: -0.04 }), tSec: 0, segments: [], pointerPath: [] }, output)
    const baseCenter = center(base.outer)
    const scaledCenter = center(scaled.outer)
    expect(scaledCenter.x).toBeCloseTo(baseCenter.x, 6)
    expect(scaledCenter.y).toBeCloseTo(baseCenter.y, 6)
    expect(scaled.rect.width).toBeCloseTo(base.rect.width * 1.25, 6)
    expect(scaled.rect.height).toBeCloseTo(base.rect.height * 1.25, 6)
  })

  it('keeps browser content registered to the scaled shell', () => {
    const settings = { kind: 'browser' as const }
    const unscaled = frameGeometry({ videoSize, project: projectWith({ size: 1 }, settings), tSec: 0, segments: [], pointerPath: [] }, output)
    const scaled = frameGeometry({ videoSize, project: projectWith({ size: 1.4 }, settings), tSec: 0, segments: [], pointerPath: [] }, output)
    const outerCenter = center(unscaled.outer)
    const contentCenter = center(unscaled.rect)
    const scaledOuterCenter = center(scaled.outer)
    const scaledContentCenter = center(scaled.rect)
    expect(scaledContentCenter.x - scaledOuterCenter.x).toBeCloseTo((contentCenter.x - outerCenter.x) * 1.4, 6)
    expect(scaledContentCenter.y - scaledOuterCenter.y).toBeCloseTo((contentCenter.y - outerCenter.y) * 1.4, 6)
    expect(scaled.rect.width).toBeCloseTo(unscaled.rect.width * 1.4, 6)
    expect(scaled.rect.height).toBeCloseTo(unscaled.rect.height * 1.4, 6)
  })
})
