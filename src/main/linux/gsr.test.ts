import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { MAX_REPLAY_SECONDS, MIN_REPLAY_SECONDS, findGsr, gsrArgs, gsrReplayArgs, monitorContaining, monitorForBounds, monitorLogicalRect, parseFirstFrameTs, planNativeCapture, regionTarget } from './gsr'

// This machine: one 3440x1440 ultrawide at 1.25, so 2752x1152 logical.
const ultrawide = { name: 'HDMI-A-2', x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }
const side = { name: 'DP-1', x: 2752, y: 0, width: 1920, height: 1080, scale: 1 }

describe('findGsr', () => {
  it('finds the first executable on PATH', () => {
    // Built the platform's way, so the test also holds where paths use backslashes.
    const bin = path.join('/usr/bin', 'gpu-screen-recorder')
    const found = findGsr(['/nope', '/usr/bin'].join(path.delimiter), (p) => p === bin)
    expect(found).toBe(bin)
    expect(findGsr('/nope', () => false)).toBeNull()
  })
})

describe('regionTarget', () => {
  it('writes WxH+X+Y in whole logical pixels', () => {
    expect(regionTarget({ x: 16, y: 54, width: 1323, height: 1031 })).toBe('1323x1031+16+54')
    expect(regionTarget({ x: 10.4, y: 20.6, width: 99.5, height: 50.2 })).toBe('100x50+10+21')
  })
})

describe('monitors', () => {
  it('turns physical size and scale into a logical rectangle', () => {
    expect(monitorLogicalRect(ultrawide)).toEqual({ x: 0, y: 0, width: 2752, height: 1152 })
    expect(monitorLogicalRect({ ...side, transform: 1 })).toEqual({ x: 2752, y: 0, width: 1080, height: 1920 })
  })

  it('finds the monitor that wholly holds a window, and none for one off-screen or spanning two', () => {
    expect(monitorContaining({ x: 16, y: 54, width: 1323, height: 1031 }, [ultrawide, side])?.name).toBe('HDMI-A-2')
    expect(monitorContaining({ x: 2800, y: 10, width: 500, height: 500 }, [ultrawide, side])?.name).toBe('DP-1')
    // Scrolled off to the right, as a scrolling layout leaves windows.
    expect(monitorContaining({ x: 3857, y: 54, width: 1323, height: 1031 }, [ultrawide])).toBeNull()
    expect(monitorContaining({ x: 2500, y: 54, width: 500, height: 500 }, [ultrawide, side])).toBeNull()
  })

  it('matches a display to its monitor by logical bounds', () => {
    expect(monitorForBounds({ x: 0, y: 0, width: 2752, height: 1152 }, [ultrawide, side])?.name).toBe('HDMI-A-2')
    expect(monitorForBounds({ x: 0, y: 0, width: 1920, height: 1080 }, [ultrawide])).toBeNull()
  })
})

describe('gsrArgs', () => {
  it('records without the cursor, at a constant rate, with the first-frame time, falling back to the CPU', () => {
    const args = gsrArgs({ target: 'HDMI-A-2', fps: 60, output: '/r/screen.mkv' })
    const flag = (f: string) => args[args.indexOf(f) + 1]
    expect(flag('-w')).toBe('HDMI-A-2')
    expect(flag('-cursor')).toBe('no')
    expect(flag('-f')).toBe('60')
    expect(flag('-fm')).toBe('cfr')
    expect(flag('-c')).toBe('mkv')
    expect(flag('-fallback-cpu-encoding')).toBe('yes')
    expect(flag('-write-first-frame-ts')).toBe('yes')
    expect(flag('-o')).toBe('/r/screen.mkv')
  })
})

describe('parseFirstFrameTs', () => {
  it('reads the real-time column of what gsr wrote on this machine', () => {
    expect(parseFirstFrameTs('monotonic_microsec\trealtime_microsec\n11291521400\t1789719133745376\n')).toBe(1789719133745)
  })

  it('returns null until the timestamp line is there', () => {
    expect(parseFirstFrameTs('')).toBeNull()
    expect(parseFirstFrameTs('monotonic_microsec\trealtime_microsec\n')).toBeNull()
  })
})

describe('planNativeCapture', () => {
  const monitors = [ultrawide]

  it('records a whole screen by monitor name, mapping the pointer over the full physical size', () => {
    const plan = planNativeCapture({ kind: 'screen', monitors, displayBounds: { x: 0, y: 0, width: 2752, height: 1152 } })
    expect(plan).toEqual({ target: 'HDMI-A-2', region: { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }, label: 'HDMI-A-2' })
  })

  it('records a window as its on-screen rectangle, in logical px, with a physical region for the pointer', () => {
    const plan = planNativeCapture({ kind: 'window', monitors, window: { x: 16, y: 54, width: 1323, height: 1031, title: 'Claude' } })
    expect(plan).toMatchObject({ target: '1323x1031+16+54', label: 'Claude', region: { x: 20, y: 68, width: 1654, height: 1288, scale: 1.25 } })
  })

  it('falls back for a window scrolled off-screen, with a reason to show', () => {
    const plan = planNativeCapture({ kind: 'window', monitors, window: { x: 3857, y: 54, width: 1323, height: 1031 } })
    expect(plan).toEqual({ skip: expect.stringMatching(/not wholly on one screen/) })
  })

  it('records a picked region, converting it to the logical rectangle gsr wants', () => {
    const plan = planNativeCapture({ kind: 'region', monitors, region: { x: 250, y: 125, width: 1000, height: 500, scale: 1.25 } })
    expect(plan).toMatchObject({ target: '800x400+200+100', region: { x: 250, y: 125, width: 1000, height: 500 } })
  })

  it('falls back when a screen cannot be matched or a window is gone', () => {
    expect(planNativeCapture({ kind: 'screen', monitors, displayBounds: { x: 0, y: 0, width: 1920, height: 1080 } })).toHaveProperty('skip')
    expect(planNativeCapture({ kind: 'window', monitors, window: null })).toHaveProperty('skip')
  })
})

describe('gsrReplayArgs', () => {
  const base = { target: 'HDMI-A-2', fps: 60, seconds: 30, directory: '/r/replays' }

  it('asks for a ring buffer held in memory, writing to a directory', () => {
    const args = gsrReplayArgs(base)
    expect(args).toContain('-r')
    expect(args[args.indexOf('-r') + 1]).toBe('30')
    expect(args.slice(args.indexOf('-replay-storage'), args.indexOf('-replay-storage') + 2)).toEqual(['-replay-storage', 'ram'])
    // The output is a directory in replay mode: every save is its own clip.
    expect(args.at(-1)).toBe('/r/replays')
    expect(args.at(-2)).toBe('-o')
  })

  it('records without the cursor, like every other capture here', () => {
    expect(gsrReplayArgs(base).slice(-4, -2)).not.toContain('-cursor')
    expect(gsrReplayArgs(base).join(' ')).toContain('-cursor no')
  })

  it('keeps the buffer to a length worth holding', () => {
    expect(gsrReplayArgs({ ...base, seconds: 1 })[gsrReplayArgs({ ...base, seconds: 1 }).indexOf('-r') + 1]).toBe(String(MIN_REPLAY_SECONDS))
    expect(gsrReplayArgs({ ...base, seconds: 99_999 })[gsrReplayArgs({ ...base, seconds: 99_999 }).indexOf('-r') + 1]).toBe(String(MAX_REPLAY_SECONDS))
  })

  it('rounds a fractional length rather than passing it on', () => {
    const args = gsrReplayArgs({ ...base, seconds: 30.6 })
    expect(args[args.indexOf('-r') + 1]).toBe('31')
  })
})
