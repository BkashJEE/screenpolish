import { describe, expect, it } from 'vitest'
import type { Camera, ZoomSegment } from './types'
import { CENTER_PULL, DEFAULT_CAMERA, HOLD_GAP_SEC, buildCameraPath, cameraAt, clampCamera, easeInOutCubic, TILT_DEG } from './camera'

const region = { width: 1920, height: 1080 }
const home: Camera = { cx: 960, cy: 540, scale: 1, tiltX: 0, tiltY: 0 }

function seg(id: string, start: number, end: number, x: number, y: number, scale = 2, style?: ZoomSegment['style']): ZoomSegment {
  return { id, start, end, x, y, scale, source: 'auto', ...(style ? { style } : {}) }
}

/** Settled means within a hundredth of a pixel and a ten-thousandth of scale. */
function expectSettled(cam: Camera, expected: { cx: number; cy: number; scale: number }) {
  expect(Math.abs(cam.cx - expected.cx)).toBeLessThan(0.01)
  expect(Math.abs(cam.cy - expected.cy)).toBeLessThan(0.01)
  expect(Math.abs(cam.scale - expected.scale)).toBeLessThan(1e-4)
}

function inBounds(cam: Camera): boolean {
  const halfW = region.width / Math.max(cam.scale, 1) / 2
  const halfH = region.height / Math.max(cam.scale, 1) / 2
  return cam.cx - halfW >= -1e-6 && cam.cx + halfW <= region.width + 1e-6 && cam.cy - halfH >= -1e-6 && cam.cy + halfH <= region.height + 1e-6
}

/** Camera samples at `hz` over [from, to]. */
function track(segments: ZoomSegment[], from: number, to: number, hz = 240, pointer: { x: number; y: number } | null = null, cfg = {}) {
  const out: Array<{ t: number; cam: Camera }> = []
  for (let n = 0; from + n / hz <= to; n++) out.push({ t: from + n / hz, cam: cameraAt(from + n / hz, segments, pointer, region, cfg) })
  return out
}

/** Where a settled zoom on focus (fx, fy) sits: grown out of the focus, eased CENTER_PULL toward centring it. */
function framed(fx: number, fy: number, scale: number) {
  const ax = fx + (region.width / 2 - fx) / scale
  const ay = fy + (region.height / 2 - fy) / scale
  return clampCamera({ cx: ax + (fx - ax) * CENTER_PULL, cy: ay + (fy - ay) * CENTER_PULL, scale }, region)
}

/** Where source point p appears on screen, in region px. */
const onScreen = (cam: Camera, p: { x: number; y: number }) => ({ x: (p.x - cam.cx) * cam.scale + region.width / 2, y: (p.y - cam.cy) * cam.scale + region.height / 2 })

// Focus away from every edge so only the spring decides where the camera is.
const A = seg('a', 2, 6, 800, 500)
const targetA = framed(800, 500, 2)

describe('easeInOutCubic', () => {
  it('hits the endpoints and the midpoint, and clamps outside 0..1', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(-1)).toBe(0)
    expect(easeInOutCubic(2)).toBe(1)
  })
})

describe('camera at rest', () => {
  it('is the full frame with no segments, before the first and well after the last', () => {
    expect(cameraAt(3, [], null, region)).toEqual(home)
    expect(cameraAt(3, [], { x: 10, y: 10 }, region)).toEqual(home)
    expect(cameraAt(1, [A], null, region)).toEqual(home)
    expect(cameraAt(2, [A], null, region)).toEqual(home)
    expect(cameraAt(8, [A], null, region)).toEqual(home)
  })

  it('settles on the segment focus and holds it', () => {
    expectSettled(cameraAt(4, [A], null, region), targetA)
    expectSettled(cameraAt(5.5, [A], null, region), targetA)
  })
})

describe('spring motion', () => {
  it('is most of the way to the target after easeSec, and nearly there soon after', () => {
    const at = cameraAt(2 + DEFAULT_CAMERA.easeSec, [A], null, region)
    expect(at.scale).toBeGreaterThan(1.9)
    expect(cameraAt(2 + DEFAULT_CAMERA.easeSec * 1.5, [A], null, region).scale).toBeGreaterThan(1.99)
  })

  it('starts gently: no speed jump at the moment it starts moving', () => {
    const early = cameraAt(2 + 1 / 60, [A], null, region)
    expect(early.scale - 1).toBeLessThan(0.02)
  })

  it('zooms in proportional steps, far smaller than the old cubic ease', () => {
    let worst = 1
    let prev = cameraAt(2, [A], null, region).scale
    for (let f = 1; f <= 90; f++) {
      const s = cameraAt(2 + f / 30, [A], null, region).scale
      worst = Math.max(worst, s / prev)
      prev = s
    }
    // The cubic ease jumped 14.9% in one 30 fps frame.
    expect(worst).toBeLessThan(1.075)
  })

  it('never changes speed abruptly, including corner-to-corner moves near the edges', () => {
    const segments = [seg('e', 1, 3, 1910, 1070, 3), seg('f', 3.2, 5, 10, 10, 2.5), A]
    const samples = track(segments, 0.5, 9)
    for (let i = 2; i < samples.length; i++) {
      const [a, b, c] = [samples[i - 2].cam, samples[i - 1].cam, samples[i].cam]
      const dvx = Math.abs(c.cx - 2 * b.cx + a.cx) * 240 * 240
      const dvs = Math.abs(Math.log(c.scale) - 2 * Math.log(b.scale) + Math.log(a.scale)) * 240 * 240
      // Bounded acceleration: a spring accelerates hard, but never instantly stops or reverses.
      expect(dvx).toBeLessThan(150_000)
      expect(dvs).toBeLessThan(120)
      expect(inBounds(c)).toBe(true)
    }
  })

  it('glides back to the full frame after the segment, a little slower than it zoomed in', () => {
    expect(cameraAt(6, [A], null, region).scale).toBeLessThan(1.5)
    expect(cameraAt(7, [A], null, region).scale).toBeLessThan(1.01)
    expect(cameraAt(8, [A], null, region)).toEqual(home)
    // Zoom-in reaches 1.9x within easeSec of its start; zoom-out is still above 1.02 easeSec after its release.
    const release = 6 - DEFAULT_CAMERA.easeSec / 2
    expect(cameraAt(release + DEFAULT_CAMERA.easeSec, [A], null, region).scale).toBeGreaterThan(1.02)
  })

  it('snaps when easeSec is 0', () => {
    expectSettled(cameraAt(2.01, [A], null, region, { easeSec: 0 }), targetA)
  })

  it('gives the same camera whatever order frames are asked for', () => {
    const segments = [A, seg('b', 6.5, 9, 1200, 700, 3)]
    const times = [7.3, 2.2, 6.4, 3, 8.9, 2.05, 6.55]
    const shuffled = times.map((t) => cameraAt(t, segments, null, region))
    const fresh = times.map((t) => buildCameraPath(segments, null, region).at(t))
    expect(shuffled).toEqual(fresh)
  })

  it('accepts unsorted segment lists', () => {
    const B = seg('b', 6.3, 10, 1200, 700, 3)
    for (const t of [3, 5.7, 6.1, 7, 9.7]) expect(cameraAt(t, [B, A], null, region)).toEqual(cameraAt(t, [A, B], null, region))
  })
})

describe('zooming from the clicked spot', () => {
  const click = { x: 1500, y: 300 }
  const clicked = [seg('c', 2, 6, click.x, click.y)]

  it('grows out of the click: the clicked spot never moves more than the gentle centring pull', () => {
    const start = onScreen(cameraAt(2, clicked, null, region, { follow: 0 }), click)
    const settled = onScreen(cameraAt(4, clicked, null, region, { follow: 0 }), click)
    expect(start).toEqual(click)
    let furthest = 0
    for (let t = 2; t <= 4; t += 1 / 60) {
      const p = onScreen(cameraAt(t, clicked, null, region, { follow: 0 }), click)
      furthest = Math.max(furthest, Math.hypot(p.x - click.x, p.y - click.y))
    }
    // The old centred zoom slid this spot 555 px to the middle of the screen.
    expect(furthest).toBeLessThanOrEqual(Math.hypot(settled.x - click.x, settled.y - click.y) + 1)
    expect(furthest).toBeLessThan(200)
  })

  it('shrinks back into the same spot, retracing the zoom-in without sliding sideways', () => {
    const settled = onScreen(cameraAt(5, clicked, null, region, { follow: 0 }), click)
    let prev = settled
    for (let t = 5.6; t <= 8; t += 1 / 60) {
      const p = onScreen(cameraAt(t, clicked, null, region, { follow: 0 }), click)
      // Every step moves back toward where the click was on the full frame, never away.
      expect(Math.hypot(p.x - click.x, p.y - click.y)).toBeLessThanOrEqual(Math.hypot(prev.x - click.x, prev.y - click.y) + 1e-6)
      prev = p
    }
    expect(prev.x).toBeCloseTo(click.x, 0)
    expect(prev.y).toBeCloseTo(click.y, 0)
  })

  it('keeps a click near a corner in its corner instead of dragging the view off-screen', () => {
    const corner = { x: 1880, y: 1040 }
    for (const { cam } of track([seg('k', 2, 6, corner.x, corner.y, 3)], 1.5, 8, 60)) {
      expect(inBounds(cam)).toBe(true)
      const p = onScreen(cam, corner)
      expect(p.x).toBeGreaterThan(region.width * 0.75)
      expect(p.y).toBeGreaterThan(region.height * 0.75)
    }
  })
})

describe('neighbouring zooms', () => {
  it('stays zoomed in and pans across when the next zoom is close', () => {
    const B = seg('b', 6 + HOLD_GAP_SEC - 0.2, 10, 1200, 700, 2)
    let lowest = Infinity
    for (let t = 5; t <= B.start + 0.5; t += 0.01) lowest = Math.min(lowest, cameraAt(t, [A, B], null, region).scale)
    expect(lowest).toBeGreaterThan(1.95)
    expectSettled(cameraAt(B.start + 2.5, [A, B], null, region), framed(1200, 700, 2))
  })

  it('returns to the full frame when the next zoom is far away', () => {
    const C = seg('c', 9.5, 12, 1200, 700, 3)
    expect(cameraAt(8.5, [A, C], null, region).scale).toBeLessThan(1.01)
  })

  it('does not jump when a moving zoom overlaps a previous segment', () => {
    const next: ZoomSegment = { ...seg('overlap', 5, 9, 1200, 700, 3), style: 'pan-left' }
    for (const boundary of [5, 6]) {
      const before = cameraAt(boundary - 1e-5, [A, next], null, region, { follow: 0 })
      const after = cameraAt(boundary, [A, next], null, region, { follow: 0 })
      expect(Math.abs(before.cx - after.cx)).toBeLessThan(0.01)
      expect(Math.abs(before.scale - after.scale)).toBeLessThan(0.001)
    }
  })
})

describe('pointer follow', () => {
  const pointer = { x: 1000, y: 700 }

  it('settles on the focus blended toward the pointer by follow', () => {
    expectSettled(cameraAt(4, [A], pointer, region), framed(800 + 200 * DEFAULT_CAMERA.follow, 500 + 200 * DEFAULT_CAMERA.follow, 2))
    expectSettled(cameraAt(4, [A], pointer, region, { follow: 0 }), targetA)
    expectSettled(cameraAt(4, [A], pointer, region, { follow: 1 }), framed(1000, 700, 2))
  })

  it('follows a moving pointer smoothly when given a function of time', () => {
    const moving = (t: number) => ({ x: 700 + 100 * t, y: 500 })
    const cam = cameraAt(5, [A], moving, region, { follow: 1 })
    // Lags slightly behind the moving framing, never ahead of it.
    expect(cam.cx).toBeLessThan(framed(1200, 500, 2).cx)
    expect(cam.cx).toBeGreaterThan(framed(1100, 500, 2).cx)
  })
})

describe('viewport clamp', () => {
  it('settles against the edges near corners', () => {
    expectSettled(cameraAt(4, [seg('c', 2, 6, 10, 10)], null, region), { cx: 480, cy: 270, scale: 2 })
    expectSettled(cameraAt(4, [seg('c', 2, 6, 1900, 1070)], null, region), { cx: 1440, cy: 810, scale: 2 })
    expectSettled(cameraAt(4, [seg('c', 2, 6, 0, 0, 4)], null, region), { cx: 240, cy: 135, scale: 4 })
    expectSettled(cameraAt(4, [seg('c', 2, 6, 1800, 1000)], { x: 5000, y: 5000 }, region, { follow: 1 }), { cx: 1440, cy: 810, scale: 2 })
  })

  it('stays inside the region throughout', () => {
    for (const { cam } of track([seg('c', 2, 6, 0, 0, 3)], 1.5, 7, 60)) expect(inBounds(cam)).toBe(true)
  })

  it('centres when the scale is 1 or below', () => {
    expect(clampCamera({ cx: 5, cy: 5, scale: 1 }, region)).toEqual(home)
    expect(clampCamera({ cx: 5, cy: 5, scale: 0.5 }, region)).toEqual({ cx: 960, cy: 540, scale: 0.5, tiltX: 0, tiltY: 0 })
  })
})

describe('camera styles', () => {
  const styled = (style: ZoomSegment['style']) => [seg(String(style), 2, 6, 600, 500, 2, style)]

  it('plain zoom has no tilt', () => {
    expect(cameraAt(4, styled('zoom'), null, region)).toMatchObject({ tiltX: 0, tiltY: 0 })
  })

  it('spring overshoots once, then settles at the requested zoom', () => {
    const peak = Math.max(...track(styled('spring'), 2, 3.5, 120).map((s) => s.cam.scale))
    expect(peak).toBeGreaterThan(2.1)
    expect(peak).toBeLessThan(2.5)
    expect(Math.abs(cameraAt(4, styled('spring'), null, region).scale - 2)).toBeLessThan(0.01)
    expect(cameraAt(7, styled('spring'), null, region).scale).toBeLessThan(1.01)
  })

  it('punch is nearly at full scale right after it starts, well ahead of a plain zoom', () => {
    expect(cameraAt(2.15, styled('punch'), null, region).scale).toBeGreaterThan(1.9)
    expect(cameraAt(2.15, styled('zoom'), null, region).scale).toBeLessThan(1.5)
  })

  it('tilts reach their angle mid-segment and glide back to flat', () => {
    expect(cameraAt(4, styled('tilt-left'), null, region).tiltX).toBeCloseTo(TILT_DEG, 2)
    expect(cameraAt(4, styled('tilt-right'), null, region).tiltX).toBeCloseTo(-TILT_DEG, 2)
    expect(cameraAt(4, styled('tilt-up'), null, region).tiltY).toBeGreaterThan(0)
    expect(cameraAt(4, styled('tilt-down'), null, region).tiltY).toBeLessThan(0)
    const during = cameraAt(2.3, styled('tilt-left'), null, region).tiltX ?? 0
    expect(during).toBeGreaterThan(0)
    expect(during).toBeLessThan(TILT_DEG)
    expect(cameraAt(8, styled('tilt-left'), null, region)).toEqual(home)
  })

  it('drift pushes in over the segment', () => {
    const early = cameraAt(2.7, styled('drift'), null, region).scale
    const late = cameraAt(5.3, styled('drift'), null, region).scale
    expect(early).toBeLessThan(late)
    expect(late).toBeLessThanOrEqual(2.001)
  })

  it('pans in opposite directions and keeps both paths in bounds', () => {
    for (const style of ['pan-left', 'pan-right'] as const) {
      const early = cameraAt(3, styled(style), null, region, { follow: 0 })
      const late = cameraAt(5, styled(style), null, region, { follow: 0 })
      expect(Math.sign(late.cx - early.cx)).toBe(style === 'pan-left' ? -1 : 1)
      expect(inBounds(late)).toBe(true)
    }
  })

  it('orbits through opposing angles and returns to a flat full frame', () => {
    expect(cameraAt(3, styled('orbit'), null, region).tiltX).toBeLessThan(0)
    expect(cameraAt(5, styled('orbit'), null, region).tiltX).toBeGreaterThan(0)
    expect(cameraAt(8, styled('orbit'), null, region)).toEqual(home)
  })
})
