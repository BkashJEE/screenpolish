import { describe, expect, it } from 'vitest'
import { resolveCaptureTarget, matchCaptureTarget, shouldTrackPortalInput, windowCoversMonitor, windowRelativePoint, regionForWindow, type HyprClient, type HyprMonitor, windowSizeMismatch, ambiguousWindowPick, windowOnScreen } from './capture-target'

const expected = { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }
const monitors: HyprMonitor[] = [
  { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25, activeWorkspace: { id: 1 } },
  { x: 2752, y: 0, width: 1920, height: 1080, scale: 1, activeWorkspace: { id: 2 } }
]
const client = (at: [number, number], size: [number, number], workspace = 1, monitor = 0): HyprClient => ({ at, size, workspace: { id: workspace }, monitor, mapped: true, hidden: false, title: 'Editor' })

describe('tracked window mapping', () => {
  it('maps resized windows into the centered contain frame', () => {
    expect(windowRelativePoint(300, 300, {width:1200,height:900}, client([0,0],[1000,900]))).toEqual([400,300])
    expect(windowRelativePoint(600, 300, {width:1200,height:900}, client([0,0],[1200,600]))).toEqual([600,450])
    expect(windowRelativePoint(600, 450, {width:600,height:450}, client([0,0],[1200,900]))).toEqual([300,225])
  })
  it('does not turn clicks outside the window into clicks on letterbox padding', () => {
    expect(windowRelativePoint(-10, 50, {width:1200,height:900}, client([0,0],[1000,900]))).toBeNull()
    expect(windowRelativePoint(1000, 50, {width:1200,height:900}, client([0,0],[1000,900]))).toBeNull()
    expect(windowRelativePoint(10, 50, {width:1200,height:900}, client([0,0],[0,900]))).toBeNull()
  })
  it('fails closed when an explicit window cannot be checked against current geometry', async () => {
    const stale = {...client([0,0],[1200,900]),address:'other-window'}
    const result = await resolveCaptureTarget({width:1200,height:900}, expected, {}, {monitors:[],clients:[stale]}, 'selected-window')
    expect(result.kind).toBe('unknown')
  })
  it('keeps clicks aligned when a captured window moves to the left tile', () => {
    const stream = { width: 1148, height: 900 }
    const before = client([1414, 54], [1315, 1031])
    const after = client([16, 54], [1315, 1031])
    const a = windowRelativePoint(1514, 154, stream, before)!
    const b = windowRelativePoint(116, 154, stream, after)!
    expect(b).toEqual(a)
    expect(b[0]).toBeGreaterThan(0)
    expect(b[0]).toBeLessThan(1148)
  })
  it('rejects cropped/ambiguous aspect ratios and hidden windows', () => {
    expect(regionForWindow({width:800,height:900}, client([0,0],[1315,1031]))).toBeNull()
    expect(windowRelativePoint(5,5,{width:100,height:100},{...client([0,0],[100,100]),hidden:true})).toBeNull()
  })
})

describe('matchCaptureTarget', () => {
  it('keeps the requested display when the stream is that display', () => {
    expect(matchCaptureTarget({ width: 3440, height: 1440 }, expected, monitors, []).kind).toBe('expected')
  })

  it('switches to the monitor the user picked in the portal instead', () => {
    expect(matchCaptureTarget({ width: 1920, height: 1080 }, expected, monitors, [])).toEqual({
      kind: 'monitor',
      region: { x: 2752, y: 0, width: 1920, height: 1080, scale: 1 }
    })
  })

  it('matches a proportionally downscaled PipeWire monitor stream', () => {
    const match = matchCaptureTarget({ width: 2450, height: 1026 }, expected, monitors, [])
    expect(match.kind).toBe('monitor')
    expect(match.region).toMatchObject({ x: 0, y: 0, width: 2450, height: 1026 })
    expect(match.region.scale).toBeCloseTo(0.89, 2)
  })

  it('finds a picked window by its scaled size on a visible workspace', () => {
    const clients = [client([100, 50], [566, 821], 3), client([2295, 54], [566, 821])]
    expect(matchCaptureTarget({ width: 708, height: 1026 }, expected, monitors, clients)).toEqual({
      kind: 'window',
      region: { x: 2869, y: 68, width: 708, height: 1026, scale: 1.25 },
      title: 'Editor'
    })
  })

  it('finds a portal window returned at logical size with decorations', () => {
    const clients = [client([1740, 54], [996, 1031]), client([607, 54], [1113, 1031])]
    expect(matchCaptureTarget({ width: 1148, height: 1026 }, expected, monitors, clients)).toEqual({
      kind: 'window',
      region: { x: 607, y: 54, width: 1148, height: 1026, scale: 1 },
      title: 'Editor'
    })
  })

  it('maps a proportionally downscaled picked window back to compositor coordinates', () => {
    const active = client([16, 54], [2720, 1031])
    const match = matchCaptureTarget({ width: 2450, height: 928 }, expected, monitors, [active])
    expect(match.kind).toBe('window')
    expect(match.region).toMatchObject({ x: 14, y: 49, width: 2450, height: 928 })
    expect(match.region.scale).toBeCloseTo(0.9, 2)
  })

  it('matches an active window content surface with wide horizontal chrome removed', () => {
    const active = client([1386, 54], [1350, 1031])
    const other = client([16, 54], [1350, 1031])
    expect(matchCaptureTarget({ width: 932, height: 1026 }, expected, monitors, [active, other])).toEqual({
      kind: 'window',
      region: { x: 1386, y: 54, width: 932, height: 1026, scale: 1 },
      title: 'Editor'
    })
  })

  it('matches the observed half-tile content surface before the other tile is hidden', () => {
    const active = client([16, 54], [1350, 1031])
    expect(matchCaptureTarget({ width: 1014, height: 1026 }, expected, monitors, [active])).toEqual({
      kind: 'window',
      region: { x: 16, y: 54, width: 1014, height: 1026, scale: 1 },
      title: 'Editor'
    })
  })

  it('reports an unknown target rather than guessing', () => {
    expect(matchCaptureTarget({ width: 1000, height: 700 }, expected, monitors, [client([0, 0], [10, 10])]).kind).toBe('unknown')
  })
})

describe('shouldTrackPortalInput', () => {
  const region = { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }

  it('keeps input for a region cropped from a complete portal monitor', () => {
    expect(shouldTrackPortalInput({ kind: 'monitor', region }, true)).toBe(true)
    expect(shouldTrackPortalInput({ kind: 'expected', region }, true)).toBe(true)
  })

  it('preserves region input even when the portal calls its backing surface custom', () => {
    expect(shouldTrackPortalInput({ kind: 'window', region }, true)).toBe(true)
    expect(shouldTrackPortalInput({ kind: 'unknown', region }, true)).toBe(true)
  })

  it('still rejects an unknown uncropped source with no coordinate mapping', () => {
    expect(shouldTrackPortalInput({ kind: 'unknown', region }, false)).toBe(false)
  })
})

describe('verifying the window the share dialog handed over', () => {
  const monitors = [{ x: 0, y: 0, width: 3440, height: 1440, scale: 1.25, activeWorkspace: { id: 1 } }]
  const win = (address: string, w: number, h: number, x = 0, y = 0, workspace = 1) => ({ address, at: [x, y] as [number, number], size: [w, h] as [number, number], monitor: 0, workspace: { id: workspace }, mapped: true, hidden: false })

  it('accepts a stream that is exactly the window at its monitor scale', () => {
    expect(windowSizeMismatch({ width: 1500, height: 1000 }, win('a', 1200, 800), 1.25)).toBeLessThan(0.01)
    // A proportional downscale by the compositor is still this window.
    expect(windowSizeMismatch({ width: 750, height: 500 }, win('a', 1200, 800), 1.25)).toBeLessThan(0.01)
    // A different shape, or a stream larger than the window, is not.
    expect(windowSizeMismatch({ width: 1500, height: 700 }, win('a', 1200, 800), 1.25)).toBeGreaterThan(0.1)
    expect(windowSizeMismatch({ width: 3000, height: 2000 }, win('a', 1200, 800), 1.25)).toBe(Infinity)
  })

  it('calls the pick ambiguous when another visible window or a monitor fits the same stream', () => {
    const stream = { width: 1500, height: 1000 }
    const alone = { monitors, clients: [win('a', 1200, 800)] }
    expect(ambiguousWindowPick(stream, 'a', alone)).toBe(false)
    // Tiled neighbour of the same size: the portal never says which was shared.
    const tiled = { monitors, clients: [win('a', 1200, 800), win('b', 1200, 800, 1220)] }
    expect(ambiguousWindowPick(stream, 'a', tiled)).toBe(true)
    // A monitor of exactly the stream's size is indistinguishable too.
    expect(ambiguousWindowPick({ width: 3440, height: 1440 }, 'a', alone)).toBe(true)
  })

  it('keeps the input log for a window that fills the monitor, where both readings are the same pixels', () => {
    // 3440x1440 at scale 1.25 is 2752x1152 logical: a maximized window on a single monitor.
    const maximized = { monitors, clients: [win('a', 2752, 1152)] }
    expect(windowCoversMonitor(win('a', 2752, 1152), monitors[0])).toBe(true)
    expect(ambiguousWindowPick({ width: 3440, height: 1440 }, 'a', maximized)).toBe(false)
    // A window of the same size parked on another monitor is not that monitor's window.
    const offset = { address: 'a', at: [4000, 0] as [number, number], size: [2752, 1152] as [number, number], monitor: 1, workspace: { id: 2 }, mapped: true, hidden: false }
    expect(windowCoversMonitor(offset, monitors[0])).toBe(false)
    expect(ambiguousWindowPick({ width: 3440, height: 1440 }, 'a', { monitors, clients: [offset] })).toBe(true)
    // A tiled neighbour of the same size still makes it ambiguous, maximized or not.
    expect(ambiguousWindowPick({ width: 3440, height: 1440 }, 'a', { monitors, clients: [win('a', 2752, 1152), win('b', 2752, 1152, 2760)] })).toBe(true)
  })

  it('still finds the monitor when the compositor did not answer during the picker', async () => {
    const stream = { width: 3440, height: 1440 }
    const expected = { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }
    const before = { monitors, clients: [win('a', 1200, 800)] }
    // A stream the panel did not predict still resolves to the screen it matches.
    const wider = await resolveCaptureTarget(stream, { x: 0, y: 0, width: 1600, height: 900, scale: 1 }, {}, before, 'a')
    expect(wider.kind).toBe('monitor')
    // The live snapshot is unavailable, so the pick cannot be checked; the snapshot taken
    // before the dialog opened still identifies the screen, which keeps pointer tracking on.
    const target = await resolveCaptureTarget(stream, expected, {}, before, 'a')
    expect(target.kind).toBe('expected')
    expect(shouldTrackPortalInput(target, false)).toBe(true)
  })

  it('treats a window on a hidden workspace as off screen', () => {
    expect(windowOnScreen(win('a', 1200, 800), monitors)).toBe(true)
    expect(windowOnScreen(win('a', 1200, 800, 0, 0, 3), monitors)).toBe(false)
    expect(windowRelativePoint(600, 400, { width: 1500, height: 1000 }, win('a', 1200, 800, 0, 0, 3), monitors)).toBeNull()
    expect(windowRelativePoint(600, 400, { width: 1500, height: 1000 }, win('a', 1200, 800), monitors)).toEqual([750, 500])
  })
})

describe('same-sized windows', () => {
  // The take that failed: Claude and an x.com web app tiled at exactly the
  // same size on a 1.25-scaled ultrawide, so the 1654x1288 stream fits both.
  const stream = { width: 1654, height: 1288 }
  const claude: HyprClient = { ...client([16, 54], [1323, 1031]), address: '0xclaude', class: 'com.anthropic.Claude' }
  const x: HyprClient = { ...client([1359, 54], [1323, 1031]), address: '0xx', class: 'chrome-x.com__-Profile_1' }
  const snapshot = { monitors: [monitors[0]], clients: [claude, x] }

  it('are ambiguous by size alone, so without pictures the take stays unknown', async () => {
    expect(ambiguousWindowPick(stream, '0xx', snapshot)).toBe(true)
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, '0xx')
    expect(result.kind).toBe('unknown')
  })

  it('resolve to the window whose content matches the stream', async () => {
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, '0xx', async () => x)
    expect(result).toMatchObject({ kind: 'window', address: '0xx' })
    expect(result.region.x).toBeCloseTo(1359 * 1.25, 0)
  })

  it('follow the pictures even when the panel named the other window', async () => {
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, '0xclaude', async () => x)
    expect(result).toMatchObject({ kind: 'window', address: '0xx' })
  })

  it('stay unknown when the pictures cannot decide', async () => {
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, '0xx', async () => null)
    expect(result.kind).toBe('unknown')
  })

  it('ignore an answer that is not one of the candidates', async () => {
    const stranger: HyprClient = { ...client([0, 0], [800, 600]), address: '0xstranger' }
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, '0xx', async () => stranger)
    expect(result.kind).toBe('unknown')
  })

  it('are told apart when the panel picked a screen but the dialog shared a window', async () => {
    const result = await resolveCaptureTarget(stream, expected, {}, snapshot, undefined, async () => claude)
    expect(result).toMatchObject({ kind: 'window', address: '0xclaude' })
  })

  it('only ask for pictures when more than one window fits', async () => {
    let asked = false
    const lone = { monitors: [monitors[0]], clients: [x] }
    await resolveCaptureTarget(stream, expected, {}, lone, undefined, async () => { asked = true; return x })
    expect(asked).toBe(false)
  })
})

describe('a window pick the portal answered with the whole screen', () => {
  // The share dialog never says what it handed over. Picking a window in the
  // panel and then sharing the screen produced a monitor-sized stream that
  // could not be tied to the window, and the take lost its whole input log:
  // no pointer, no clicks, no auto zoom (2026-09-24_22-23-21).
  const stream = { width: 3440, height: 1440 }
  const windowAsk = { x: 125, y: 125, width: 3440, height: 1440, scale: 1.25 }
  const picked: HyprClient = { ...client([100, 100], [2752, 1152]), address: 'picked' }

  it('keeps the input log by placing the stream on the screen it plainly covers', async () => {
    const result = await resolveCaptureTarget(stream, windowAsk, {}, { monitors, clients: [picked] }, 'picked')
    expect(result.kind).not.toBe('unknown')
    expect(result.region).toMatchObject({ width: 3440, height: 1440 })
  })

  it('does the same when the window is smaller than what the dialog shared', async () => {
    const small: HyprClient = { ...client([100, 100], [1400, 900]), address: 'small' }
    const result = await resolveCaptureTarget(stream, { x: 0, y: 0, width: 1750, height: 1125, scale: 1.25 }, {}, { monitors, clients: [small] }, 'small')
    expect(result.kind).toBe('monitor')
  })

  it('gives up only when the stream matches no window, monitor or asked-for region', async () => {
    const odd = { x: 0, y: 0, width: 777, height: 555, scale: 1 }
    const result = await resolveCaptureTarget({ width: 1234, height: 987 }, odd, {}, { monitors, clients: [picked] }, 'picked')
    expect(result.kind).toBe('unknown')
  })
})
