import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT, type Overlay, type Project } from '../../shared/types'
import type { OverlayFrame } from '../../render/overlays'
import {
  DEFAULT_FADE,
  DEFAULT_OVERLAY_LENGTH,
  DEFAULT_TEXT_STYLE,
  DEFAULT_W,
  EMOJI_PICKS,
  MIN_OVERLAY_W,
  addOverlay,
  clampOverlay,
  createOverlay,
  duplicateOverlay,
  handlePoint,
  hitTestOverlayLane,
  hitTestOverlays,
  movedBy,
  normalizeAngle,
  nudged,
  overlayLabel,
  pointInFrame,
  removeOverlay,
  resizedTo,
  rotatedTo,
  updateOverlay
} from './overlays'

const OUT = { width: 1920, height: 1080 }

function overlay(over: Partial<Overlay> = {}): Overlay {
  return { id: 'a', kind: 'emoji', content: '🔥', x: 0.5, y: 0.5, w: 0.2, rotation: 0, start: 1, end: 3, pinned: false, fadeSec: 0, ...over }
}

function frame(over: Partial<OverlayFrame> = {}): OverlayFrame {
  return { id: 'a', cx: 960, cy: 540, width: 400, height: 200, rotation: 0, alpha: 1, fontPx: 50, measured: { width: 100, height: 50 }, ...over }
}

const project = (overlays: Overlay[] = []): Project => ({ ...DEFAULT_PROJECT, overlays })

describe('createOverlay', () => {
  it('centres the overlay, starts at the playhead and runs 3 s', () => {
    const o = createOverlay({ kind: 'emoji', content: '🔥', t: 2, duration: 30 })
    expect(o.x).toBe(0.5)
    expect(o.y).toBe(0.5)
    expect(o.w).toBe(DEFAULT_W.emoji)
    expect(o.start).toBe(2)
    expect(o.end).toBe(2 + DEFAULT_OVERLAY_LENGTH)
    expect(o.pinned).toBe(false)
    expect(o.fadeSec).toBe(DEFAULT_FADE)
    expect(o.rotation).toBe(0)
    expect(o.text).toBeUndefined()
    expect(o.id).toMatch(/^o-/)
  })
  it('uses end 0 when the default length would pass the end of the recording', () => {
    expect(createOverlay({ kind: 'text', content: 'hi', t: 8, duration: 10 }).end).toBe(0)
    expect(createOverlay({ kind: 'text', content: 'hi', t: 7, duration: 10 }).end).toBe(0)
    expect(createOverlay({ kind: 'text', content: 'hi', t: 6.9, duration: 10 }).end).toBeCloseTo(9.9)
  })
  it('gives text overlays the default style and per-kind widths', () => {
    const t = createOverlay({ kind: 'text', content: 'hi', t: 0, duration: 10 })
    expect(t.text).toEqual(DEFAULT_TEXT_STYLE)
    expect(t.text).not.toBe(DEFAULT_TEXT_STYLE)
    expect(t.w).toBe(0.4)
    expect(createOverlay({ kind: 'image', content: 'C:\\a.png', t: 0, duration: 10 }).w).toBe(0.3)
  })
  it('tolerates an unknown duration and a NaN playhead', () => {
    const o = createOverlay({ kind: 'emoji', content: 'x', t: NaN, duration: NaN })
    expect(o.start).toBe(0)
    expect(o.end).toBe(DEFAULT_OVERLAY_LENGTH)
  })
  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createOverlay({ kind: 'emoji', content: 'x', t: 0, duration: 1 }).id))
    expect(ids.size).toBe(50)
  })
})

describe('clampOverlay / normalizeAngle', () => {
  it('keeps the centre on the frame and the width within bounds', () => {
    const o = clampOverlay(overlay({ x: -1, y: 2, w: 5 }))
    expect(o).toMatchObject({ x: 0, y: 1, w: 1 })
    expect(clampOverlay(overlay({ w: 0 })).w).toBe(MIN_OVERLAY_W)
  })
  it('returns the same object when nothing changes', () => {
    const o = overlay()
    expect(clampOverlay(o)).toBe(o)
  })
  it('keeps end after start (end 0 stays open)', () => {
    expect(clampOverlay(overlay({ start: 5, end: 4 })).end).toBeCloseTo(5.1)
    expect(clampOverlay(overlay({ start: 5, end: 0 })).end).toBe(0)
  })
  it('wraps rotation to (-180, 180]', () => {
    expect(normalizeAngle(190)).toBe(-170)
    expect(normalizeAngle(-190)).toBe(170)
    expect(normalizeAngle(180)).toBe(180)
    expect(normalizeAngle(-180)).toBe(180)
    expect(normalizeAngle(NaN)).toBe(0)
  })
})

describe('project updates', () => {
  it('adds, updates and removes immutably', () => {
    const p0 = project()
    const p1 = addOverlay(p0, overlay())
    expect(p0.overlays).toHaveLength(0)
    expect(p1.overlays).toHaveLength(1)
    const p2 = updateOverlay(p1, 'a', { x: 0.1, rotation: 30 })
    expect(p1.overlays[0].x).toBe(0.5)
    expect(p2.overlays[0]).toMatchObject({ x: 0.1, rotation: 30 })
    expect(updateOverlay(p2, 'a', { x: 0.1 })).toBe(p2)
    expect(updateOverlay(p2, 'zzz', { x: 0.9 })).toBe(p2)
    const p3 = removeOverlay(p2, 'a')
    expect(p3.overlays).toHaveLength(0)
    expect(removeOverlay(p3, 'a')).toBe(p3)
  })
  it('duplicates with a fresh id, offset position and a copied text style', () => {
    const src = overlay({ kind: 'text', content: 't', text: { ...DEFAULT_TEXT_STYLE } })
    const dup = duplicateOverlay(src)
    expect(dup.id).not.toBe(src.id)
    expect(dup.x).toBeCloseTo(0.53)
    expect(dup.y).toBeCloseTo(0.53)
    expect(dup.text).toEqual(src.text)
    expect(dup.text).not.toBe(src.text)
    expect(duplicateOverlay(overlay({ x: 0.99, y: 0.99 })).x).toBe(1)
  })
  it('labels overlays for the list', () => {
    expect(overlayLabel(overlay({ content: '🔥' }))).toBe('🔥')
    expect(overlayLabel(overlay({ kind: 'image', content: 'C:\\pics\\logo.png' }))).toBe('logo.png')
    expect(overlayLabel(overlay({ kind: 'text', content: 'First line\nsecond' }))).toBe('First line')
    expect(overlayLabel(overlay({ kind: 'text', content: '   ' }))).toBe('Text')
    expect(overlayLabel(overlay({ kind: 'text', content: 'a'.repeat(40) }))).toHaveLength(24)
  })
})

describe('hit testing', () => {
  it('finds points inside an unrotated box', () => {
    const f = frame()
    expect(pointInFrame(f, { x: 960, y: 540 })).toBe(true)
    expect(pointInFrame(f, { x: 1159, y: 639 })).toBe(true)
    expect(pointInFrame(f, { x: 1161, y: 540 })).toBe(false)
    expect(pointInFrame(f, { x: 1161, y: 540 }, 2)).toBe(true)
  })
  it('respects rotation', () => {
    const f = frame({ rotation: 90 })
    // Rotated 90°: the box is now 200 wide and 400 tall.
    expect(pointInFrame(f, { x: 960, y: 730 })).toBe(true)
    expect(pointInFrame(f, { x: 1150, y: 540 })).toBe(false)
  })
  it('places the handle at the rotated bottom-right corner', () => {
    expect(handlePoint(frame())).toEqual({ x: 1160, y: 640 })
    const h = handlePoint(frame({ rotation: 90 }))
    expect(h.x).toBeCloseTo(960 - 100)
    expect(h.y).toBeCloseTo(540 + 200)
  })
  it('returns the topmost body, the selected handle first, and skips hidden frames', () => {
    const under = frame({ id: 'under', cx: 900, cy: 540 })
    const over = frame({ id: 'over', cx: 1000, cy: 540 })
    expect(hitTestOverlays([under, over], { x: 960, y: 540 })).toEqual({ kind: 'body', id: 'over' })
    expect(hitTestOverlays([under, over], { x: 720, y: 540 })).toEqual({ kind: 'body', id: 'under' })
    expect(hitTestOverlays([under, over], { x: 10, y: 10 })).toBeNull()
    expect(hitTestOverlays([under, over], { x: 1200, y: 640 }, { selectedId: 'over', handlePx: 10 })).toEqual({ kind: 'handle', id: 'over' })
    expect(hitTestOverlays([under, over], { x: 1215, y: 650 }, { selectedId: 'under' })).toBeNull()
    expect(hitTestOverlays([under, over], { x: 1215, y: 650 }, { selectedId: 'over' })).toBeNull()
    const hidden = frame({ id: 'hidden', alpha: 0 })
    expect(hitTestOverlays([hidden], { x: 960, y: 540 })).toBeNull()
    expect(hitTestOverlays([hidden], { x: 960, y: 540 }, { selectedId: 'hidden' })).toEqual({ kind: 'body', id: 'hidden' })
  })
})

describe('drag math', () => {
  it('moves by the pointer delta in output fractions, clamped', () => {
    expect(movedBy({ x: 0.5, y: 0.5 }, { x: 192, y: -108 }, OUT)).toEqual({ x: 0.6, y: 0.4 })
    expect(movedBy({ x: 0.95, y: 0.5 }, { x: 500, y: 0 }, OUT).x).toBe(1)
  })
  it('resizes from the handle: local x is half the new width', () => {
    expect(resizedTo(frame(), { x: 960 + 300, y: 540 + 10 }, OUT)).toBeCloseTo(600 / 1920)
    expect(resizedTo(frame(), { x: 960 - 300, y: 540 }, OUT)).toBe(MIN_OVERLAY_W)
    expect(resizedTo(frame(), { x: 960 + 5000, y: 540 }, OUT)).toBe(1)
    // A pinned overlay at zoom 2 authors half the on-screen width.
    expect(resizedTo(frame(), { x: 960 + 300, y: 540 }, OUT, 2)).toBeCloseTo(300 / 1920)
    // Rotated 90°: dragging straight down grows the width.
    expect(resizedTo(frame({ rotation: 90 }), { x: 960, y: 540 + 250 }, OUT)).toBeCloseTo(500 / 1920)
  })
  it('rotates by the angle swept around the centre and snaps near 15° steps', () => {
    const c = { x: 0, y: 0 }
    expect(rotatedTo(c, { x: 10, y: 0 }, { x: 0, y: 10 }, 0)).toBeCloseTo(90)
    expect(rotatedTo(c, { x: 10, y: 0 }, { x: 0, y: 10 }, 120)).toBeCloseTo(-150)
    expect(rotatedTo(c, { x: 10, y: 0 }, { x: 10, y: 0.3 }, 43, true)).toBe(45)
    expect(rotatedTo(c, { x: 10, y: 0 }, { x: 10, y: 0 }, 38, true)).toBe(38)
  })
  it('nudges within bounds', () => {
    expect(nudged({ x: 0.5, y: 0.5 }, 0.005, -0.02)).toEqual({ x: 0.505, y: 0.48 })
    expect(nudged({ x: 0.001, y: 0.999 }, -0.02, 0.02)).toEqual({ x: 0, y: 1 })
  })
})

describe('hitTestOverlayLane', () => {
  const overlays = [overlay({ id: 'a', start: 1, end: 3 }), overlay({ id: 'b', start: 2, end: 0 })]
  const base = { width: 1000, duration: 10, overlays }
  it('finds edges before bodies, later overlays first, and resolves end 0 to the duration', () => {
    expect(hitTestOverlayLane({ ...base, x: 100 })).toEqual({ kind: 'start', id: 'a' })
    expect(hitTestOverlayLane({ ...base, x: 302 })).toEqual({ kind: 'end', id: 'a' })
    expect(hitTestOverlayLane({ ...base, x: 250 })).toEqual({ kind: 'body', id: 'b' })
    expect(hitTestOverlayLane({ ...base, x: 150 })).toEqual({ kind: 'body', id: 'a' })
    expect(hitTestOverlayLane({ ...base, x: 998 })).toEqual({ kind: 'end', id: 'b' })
    expect(hitTestOverlayLane({ ...base, x: 50 })).toEqual({ kind: 'empty', t: 0.5 })
  })
  it('is empty without a duration or width', () => {
    expect(hitTestOverlayLane({ ...base, duration: 0, x: 100 })).toEqual({ kind: 'empty', t: 0 })
    expect(hitTestOverlayLane({ ...base, width: 0, x: 100 })).toEqual({ kind: 'empty', t: 0 })
  })
})

describe('EMOJI_PICKS', () => {
  it('is a grid of 64 distinct stickers', () => {
    expect(EMOJI_PICKS).toHaveLength(64)
    expect(new Set(EMOJI_PICKS).size).toBe(64)
  })
})
