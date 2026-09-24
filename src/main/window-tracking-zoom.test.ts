// End-to-end check of window tracking on Hyprland: clicks recorded while the
// captured window moves and resizes must land on the same UI in the video,
// and auto zoom must centre on it. Hyprland IPC and evdev are faked; the input
// logger, window mapping, zoom planner and camera are the real code.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HyprClient } from './linux/capture-target'

const hypr = vi.hoisted(() => ({ client: null as HyprClient | null }))
const handlers = vi.hoisted(() => ({ current: null as null | { onMove(x: number, y: number): void; onButton(x: number, y: number, b: 'left', down: boolean): void } }))

const MONITORS = [{ x: 0, y: 0, width: 1500, height: 1000, scale: 1.25, activeWorkspace: { id: 1 } }]

vi.mock('./linux/capture-target', async (importOriginal) => {
  const real = await importOriginal<typeof import('./linux/capture-target')>()
  const snapshot = async () => ({ monitors: MONITORS, clients: hypr.client ? [hypr.client] : [] })
  return { ...real, snapshotCaptureTargets: snapshot, snapshotWindows: snapshot }
})
vi.mock('./linux/input-source', () => ({
  LinuxInputSource: class {
    start(h: typeof handlers.current) {
      handlers.current = h
      return { pointer: true, buttons: true }
    }
    stop() {}
  }
}))

import { InputLogger } from './input-logger'
import { planAutoZoom } from '../shared/zoom-planner'
import { cameraAt } from '../shared/camera'

// A 1200x800 logical window on a 1.25x monitor: the portal stream is 1500x1000.
const stream = { x: 0, y: 0, width: 1500, height: 1000, scale: 1.25 }
const windowAt = (x: number, y: number, w = 1200, h = 800, workspace = 1): HyprClient => ({ address: '0xabc', at: [x, y], size: [w, h], monitor: 0, workspace: { id: workspace }, mapped: true, hidden: false, title: 'Editor' })

async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

async function clickAt(screenX: number, screenY: number) {
  handlers.current!.onMove(screenX, screenY)
  handlers.current!.onButton(screenX, screenY, 'left', true)
  await settle(80)
  handlers.current!.onButton(screenX, screenY, 'left', false)
}

// The input logger only reads the Linux input source on Linux, so off Linux
// there is nothing to drive and every click would be dropped.
describe.skipIf(process.platform !== 'linux')('auto zoom follows a recorded window that moves and resizes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it('maps each click to the same button in the video and zooms onto it', async () => {
    hypr.client = windowAt(100, 80)
    const logger = new InputLogger()
    logger.start(stream, Date.now(), { windowAddress: '0xabc', window: hypr.client, monitors: MONITORS })
    await settle(1000)

    // 1 s: Save button at window-local (1000, 600).
    await clickAt(100 + 1000, 80 + 600)
    await settle(2000)

    // Window dragged to (600, 300); the tracker refreshes every 50 ms.
    hypr.client = windowAt(600, 300)
    await settle(200)
    await clickAt(600 + 1000, 300 + 600)
    await settle(2000)

    // Window resized narrower; the right-anchored button moves to local (800, 600).
    hypr.client = windowAt(600, 300, 900, 800)
    await settle(200)
    await clickAt(600 + 800, 300 + 600)
    await settle(500)

    // A click on the desktop beside the window is not part of the recording.
    await clickAt(50, 50)
    await settle(2000)
    const events = logger.stop()

    const presses = events.clicks.filter((c) => c.down).map((c) => [c.x, c.y])
    // Before and after the move the button is at the same place in the video.
    expect(presses[0]).toEqual([1250, 750])
    expect(presses[1]).toEqual([1250, 750])
    // After the resize the narrower window is centred in the fixed frame
    // (encoder "contain"): 1125 px wide with 187.5 px bars, button at local 800 * 1.25.
    expect(presses[2]).toEqual([1187.5, 750])
    expect(presses).toHaveLength(3)

    const duration = 8
    const segments = planAutoZoom(events, duration, { motion: 'zoom', scale: 2 })
    expect(segments.length).toBeGreaterThan(0)
    for (const [i, t] of [1, 3.2, 5.4].entries()) {
      const seg = segments.find((s) => t >= s.start && t <= s.end)
      expect(seg, `a zoom covers click ${i + 1}`).toBeTruthy()
    }
    // Once settled, the camera shows the clicked button near the middle of the frame.
    const region = { width: stream.width, height: stream.height }
    const lastClick = segments.find((s) => 5.4 >= s.start && 5.4 <= s.end)!
    const cam = cameraAt(Math.min(lastClick.end - 0.05, 6.2), segments, null, region, { follow: 0 })
    const onScreenX = (1187.5 - cam.cx) * cam.scale + region.width / 2
    const onScreenY = (750 - cam.cy) * cam.scale + region.height / 2
    expect(cam.scale).toBeGreaterThan(1.5)
    expect(onScreenX).toBeGreaterThan(0)
    expect(onScreenX).toBeLessThan(region.width)
    expect(onScreenY).toBeGreaterThan(0)
    expect(onScreenY).toBeLessThan(region.height)
  })

  it('ignores clicks made while another workspace is showing', async () => {
    hypr.client = windowAt(100, 80)
    const logger = new InputLogger()
    logger.start(stream, Date.now(), { windowAddress: '0xabc', window: hypr.client, monitors: MONITORS })
    await settle(300)
    await clickAt(100 + 1000, 80 + 600)
    // The user switches to workspace 3; Hyprland keeps the window's coordinates.
    hypr.client = windowAt(100, 80, 1200, 800, 3)
    await settle(300)
    await clickAt(100 + 1000, 80 + 600)
    expect(logger.stop().clicks.filter((c) => c.down)).toHaveLength(1)
  })

  it('records nothing while the selected window cannot be found, instead of guessing', async () => {
    hypr.client = null
    const logger = new InputLogger()
    logger.start(stream, Date.now(), { windowAddress: '0xabc', window: hypr.client, monitors: MONITORS })
    await settle(200)
    await clickAt(500, 500)
    expect(logger.stop().clicks).toEqual([])
  })
})
