/**
 * On Wayland the portal picker, not ScreenPolish, decides what is captured: the
 * user can pick any monitor, a single window or a drawn region there, whatever
 * the record panel said. Pointer positions are logged against a region, so that
 * region has to describe what the stream really shows or every zoom lands in
 * the wrong place. This matches the stream size against Hyprland's monitors and
 * visible windows to recover it.
 */

import type { CaptureRegion } from '@shared/types'
import { hyprRequest, hyprSocketPaths } from './hypr'

export interface HyprMonitor {
  /** Connector name, e.g. HDMI-A-2; what gpu-screen-recorder takes to record a monitor. */
  name?: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  transform?: number
  activeWorkspace?: { id: number }
  specialWorkspace?: { id: number }
}

export interface HyprClient {
  address?: string
  at: [number, number]
  size: [number, number]
  mapped?: boolean
  hidden?: boolean
  monitor: number
  workspace: { id: number; name?: string }
  title?: string
  /** Foreign-toplevel identifier; grim -T captures the window with it. */
  stableId?: string
  class?: string
  initialClass?: string
}

export type CaptureTargetMatch =
  | { kind: 'expected'; region: CaptureRegion }
  | { kind: 'monitor'; region: CaptureRegion }
  | { kind: 'window'; region: CaptureRegion; title?: string; address?: string }
  | { kind: 'unknown'; region: CaptureRegion }

export interface CaptureTargetSnapshot {
  monitors: HyprMonitor[]
  clients: HyprClient[]
}

/** Whether compositor coordinates can be mapped to the final captured pixels. */
export function shouldTrackPortalInput(target: CaptureTargetMatch, cropApplied: boolean): boolean {
  // A ScreenPolish region has an explicit compositor-space rectangle and is
  // cropped after capture. Preserve its input log even when the portal labels
  // the backing surface as custom; otherwise both cursor and auto zoom vanish.
  if (cropApplied) return true
  return target.kind !== 'unknown'
}

/** Pixel slack for rounding: Hyprland rounds logical × scale, encoders round to even. */
const SLACK = 3
/** Hyprland's portal stream can include server-side window decorations. */
const WINDOW_SLACK = 64
/** Portal window streams may omit wide application chrome while preserving one edge. */
const PARTIAL_WINDOW_MIN_RATIO = 0.6
/** PipeWire may proportionally downscale a picked window before Chromium receives it. */
const DOWNSCALED_WINDOW_MIN_RATIO = 0.5
const DOWNSCALED_WINDOW_MAX_RATIO = 1.05
const DOWNSCALED_WINDOW_AXIS_TOLERANCE = 0.02

const near = (a: number, b: number): boolean => Math.abs(a - b) <= SLACK

export function matchCaptureTarget(
  stream: { width: number; height: number },
  expected: CaptureRegion,
  monitors: readonly HyprMonitor[],
  clients: readonly HyprClient[]
): CaptureTargetMatch {
  if (near(stream.width, expected.width) && near(stream.height, expected.height)) return { kind: 'expected', region: expected }

  for (const m of monitors) {
    // Transforms 1, 3, 5 and 7 rotate the output by 90°, swapping its pixel axes.
    const rotated = m.transform !== undefined && m.transform % 2 === 1
    const w = rotated ? m.height : m.width
    const h = rotated ? m.width : m.height
    if (near(stream.width, w) && near(stream.height, h)) {
      return { kind: 'monitor', region: { x: Math.round(m.x * m.scale), y: Math.round(m.y * m.scale), width: stream.width, height: stream.height, scale: m.scale } }
    }
  }

  // PipeWire may negotiate a downscaled full-monitor stream to stay within its
  // capture/encoder limits. Hyprland reports physical monitor pixels plus its
  // logical scale, so compare against the logical monitor aspect and recover
  // the effective stream scale used to map compositor pointer coordinates.
  for (const m of monitors) {
    const rotated = m.transform !== undefined && m.transform % 2 === 1
    const logicalWidth = (rotated ? m.height : m.width) / Math.max(m.scale, 1e-6)
    const logicalHeight = (rotated ? m.width : m.height) / Math.max(m.scale, 1e-6)
    const scaleX = stream.width / logicalWidth
    const scaleY = stream.height / logicalHeight
    const areaRatio = (stream.width * stream.height) / Math.max(1, logicalWidth * logicalHeight)
    if (areaRatio >= 0.7 && areaRatio <= 1.3 && Math.abs(scaleX - scaleY) <= 0.02) {
      const effectiveScale = (scaleX + scaleY) / 2
      return {
        kind: 'monitor',
        region: {
          x: Math.round(m.x * effectiveScale),
          y: Math.round(m.y * effectiveScale),
          width: stream.width,
          height: stream.height,
          scale: effectiveScale
        }
      }
    }
  }

  const visible = clients.filter((c, _i) => {
    if (c.mapped === false || c.hidden) return false
    const m = monitors[c.monitor]
    return !m || m.activeWorkspace?.id === undefined || c.workspace.id === m.activeWorkspace.id || c.workspace.id === m.specialWorkspace?.id
  })
  for (const c of visible) {
    const scale = monitors[c.monitor]?.scale ?? expected.scale ?? 1
    if (near(stream.width, Math.round(c.size[0] * scale)) && near(stream.height, Math.round(c.size[1] * scale))) {
      return {
        kind: 'window',
        region: { x: Math.round(c.at[0] * scale), y: Math.round(c.at[1] * scale), width: stream.width, height: stream.height, scale },
        ...(c.title ? { title: c.title } : {})
      }
    }
  }

  // xdg-desktop-portal-hyprland may return a window at logical resolution
  // (plus server-side decoration) even on a scaled output. Match the closest
  // visible client within a conservative edge delta and keep coordinates in
  // logical units so pointer positions line up with that stream.
  const logical = visible
    .map((client) => ({
      client,
      dx: Math.abs(stream.width - client.size[0]),
      dy: Math.abs(stream.height - client.size[1])
    }))
    .filter(({ dx, dy }) => dx <= WINDOW_SLACK && dy <= WINDOW_SLACK)
    .sort((a, b) => a.dx + a.dy - (b.dx + b.dy))[0]
  if (logical) {
    const c = logical.client
    return {
      kind: 'window',
      region: { x: c.at[0], y: c.at[1], width: stream.width, height: stream.height, scale: 1 },
      ...(c.title ? { title: c.title } : {})
    }
  }

  // PipeWire may negotiate a proportionally downscaled window stream. Map
  // compositor coordinates through that negotiated factor so cursor and click
  // positions stay aligned with the captured pixels. resolveCaptureTarget puts
  // the active window first, which breaks ties between similarly sized tiles.
  const downscaled = visible.find((c) => {
    const [cw, ch] = c.size
    const scaleX = stream.width / Math.max(1, cw)
    const scaleY = stream.height / Math.max(1, ch)
    return (
      scaleX >= DOWNSCALED_WINDOW_MIN_RATIO &&
      scaleX <= DOWNSCALED_WINDOW_MAX_RATIO &&
      scaleY >= DOWNSCALED_WINDOW_MIN_RATIO &&
      scaleY <= DOWNSCALED_WINDOW_MAX_RATIO &&
      Math.abs(scaleX - scaleY) <= DOWNSCALED_WINDOW_AXIS_TOLERANCE
    )
  })
  if (downscaled) {
    const scaleX = stream.width / Math.max(1, downscaled.size[0])
    const scaleY = stream.height / Math.max(1, downscaled.size[1])
    const scale = (scaleX + scaleY) / 2
    return {
      kind: 'window',
      region: {
        x: Math.round(downscaled.at[0] * scale),
        y: Math.round(downscaled.at[1] * scale),
        width: stream.width,
        height: stream.height,
        scale
      },
      ...(downscaled.title ? { title: downscaled.title } : {})
    }
  }

  // Electron/Chromium windows can expose a content surface rather than the
  // complete Hyprland client. In observed split-window layouts the height was
  // effectively unchanged (1031 -> 1026) while horizontal app chrome reduced
  // the stream width (1350 -> 932). Accept that shape when one edge is close
  // and both stream edges still cover most of the active client. Callers order
  // the active window first so equal-sized tiled clients do not get confused.
  const partial = visible.find((c) => {
    const [cw, ch] = c.size
    const widthRatio = stream.width / Math.max(1, cw)
    const heightRatio = stream.height / Math.max(1, ch)
    const fits = stream.width <= cw + WINDOW_SLACK && stream.height <= ch + WINDOW_SLACK
    const substantial = widthRatio >= PARTIAL_WINDOW_MIN_RATIO && heightRatio >= PARTIAL_WINDOW_MIN_RATIO
    const anchored = Math.abs(stream.width - cw) <= WINDOW_SLACK || Math.abs(stream.height - ch) <= WINDOW_SLACK
    return fits && substantial && anchored
  })
  if (partial) {
    return {
      kind: 'window',
      region: { x: partial.at[0], y: partial.at[1], width: stream.width, height: stream.height, scale: 1 },
      ...(partial.title ? { title: partial.title } : {})
    }
  }

  return { kind: 'unknown', region: { x: 0, y: 0, width: stream.width, height: stream.height, scale: expected.scale } }
}

async function hyprJson<T>(command: string, paths: readonly string[]): Promise<T | null> {
  const reply = await hyprRequest(`j/${command}`, paths, 500)
  if (reply === null) return null
  try {
    return JSON.parse(reply) as T
  } catch {
    return null
  }
}

/** Capture compositor geometry before the picker changes focus or tiling layout. */
/** Clients and monitors only: what window tracking needs, in two round trips instead of three. */
export async function snapshotWindows(env: NodeJS.ProcessEnv = process.env): Promise<CaptureTargetSnapshot | null> {
  const paths = hyprSocketPaths(env)
  if (paths.length === 0) return null
  const [monitors, clients] = await Promise.all([hyprJson<HyprMonitor[]>('monitors', paths), hyprJson<HyprClient[]>('clients', paths)])
  return monitors && clients ? { monitors, clients } : null
}

export async function snapshotCaptureTargets(env: NodeJS.ProcessEnv = process.env): Promise<CaptureTargetSnapshot | null> {
  const paths = hyprSocketPaths(env)
  if (paths.length === 0) return null
  const [monitors, clients, active] = await Promise.all([
    hyprJson<HyprMonitor[]>('monitors', paths),
    hyprJson<HyprClient[]>('clients', paths),
    hyprJson<HyprClient>('activewindow', paths)
  ])
  if (!monitors || !clients) return null
  const orderedClients = active ? [active, ...(clients ?? [])] : (clients ?? [])
  return { monitors, clients: orderedClients }
}

/** Query Hyprland and match. Without Hyprland only the expected-size check can succeed. */
export async function resolveCaptureTarget(
  stream: { width: number; height: number },
  expected: CaptureRegion,
  env: NodeJS.ProcessEnv = process.env,
  beforePicker?: CaptureTargetSnapshot | null,
  selectedAddress?: string,
  identify?: IdentifyWindow
): Promise<CaptureTargetMatch> {
  const current = await snapshotCaptureTargets(env)
  // Same-sized windows are common in tiled layouts. Size cannot choose between
  // them; what they show can, when the caller can compare pictures.
  const byContent = async (): Promise<CaptureTargetMatch | null> => {
    const snapshot = current ?? beforePicker ?? null
    const matches = matchingWindows(stream, snapshot)
    if (matches.length < 2 || !identify) return null
    const picked = await identify(matches).catch(() => null)
    if (!picked || !matches.includes(picked)) return null
    const region = regionForWindow(stream, picked, monitorScaleFor(picked, snapshot?.monitors ?? []))
    return region ? { kind: 'window', region, address: picked.address, title: picked.title } : null
  }
  if (selectedAddress) {
    const clients = current?.clients ?? []
    const client = clients.find(c => c.address === selectedAddress && c.mapped !== false && !c.hidden)
    const region = client ? regionForWindow(stream, client, monitorScaleFor(client, current?.monitors ?? [])) : null
    // The portal never says which window the share dialog handed over. Accept
    // the panel's pick only when it is the sole thing on screen that matches
    // this stream: another window (or a monitor) of the same size would be
    // indistinguishable by size, and tracking the wrong one silently zooms
    // elsewhere. Then only the pictures can decide.
    if (region && !ambiguousWindowPick(stream, selectedAddress, current)) {
      return { kind: 'window', region, address: selectedAddress, title: client!.title }
    }
    const identified = await byContent()
    if (identified) return identified
    // The pick could not be confirmed: either it does not fit the stream (the
    // dialog handed over something else) or another window or monitor of the
    // same size makes it indistinguishable. Match the stream on its own before
    // giving up. The snapshot taken before the picker counts too: one failed
    // hyprctl call while the dialog was open should not cost the take its
    // input log.
    for (const snapshot of [current, beforePicker]) {
      if (!snapshot) continue
      const guess = matchCaptureTarget(stream, expected, snapshot.monitors, snapshot.clients)
      // A whole screen, or the rectangle the panel already asked for, places the stream
      // without guessing between windows, so pointer coordinates stay meaningful.
      if (guess.kind === 'monitor' || guess.kind === 'expected') return guess
    }
    return { kind: 'unknown', region: { ...expected, width: stream.width, height: stream.height } }
  }
  const identified = await byContent()
  if (identified) return identified
  const candidates = [current, beforePicker].filter((snapshot): snapshot is CaptureTargetSnapshot => snapshot !== null && snapshot !== undefined)
  for (const snapshot of candidates) {
    const match = matchCaptureTarget(stream, expected, snapshot.monitors, snapshot.clients)
    if (match.kind !== 'unknown') return match
  }
  return { kind: 'unknown', region: { x: 0, y: 0, width: stream.width, height: stream.height, scale: expected.scale } }
}

/**
 * Given windows that all fit the stream by size, the one whose content is the
 * stream's, or null when that cannot be told. Supplied by the caller because
 * it needs a frame of the stream and a capture of each window.
 */
export type IdentifyWindow = (candidates: HyprClient[]) => Promise<HyprClient | null>

/** The scale of the monitor a window sits on, for turning its logical size into stream pixels. */
export function monitorScaleFor(client: HyprClient, monitors: readonly HyprMonitor[]): number {
  const scale = monitors[client.monitor]?.scale
  return typeof scale === 'number' && scale > 0 ? scale : 1
}

/** How far the stream is from showing this whole window, as a fraction. 0 = exact. */
export function windowSizeMismatch(stream: { width: number; height: number }, client: HyprClient, monitorScale = 1): number {
  const expectedW = client.size[0] * monitorScale
  const expectedH = client.size[1] * monitorScale
  if (!(expectedW > 0) || !(expectedH > 0) || !(stream.width > 0) || !(stream.height > 0)) return Infinity
  // A window is captured at its own pixels, or proportionally scaled down by
  // the compositor; either way the two axes must scale by the same factor.
  const sx = stream.width / expectedW
  const sy = stream.height / expectedH
  if (sx > 1.02 || sy > 1.02) return Infinity
  return Math.max(Math.abs(sx / sy - 1), Math.abs(1 - Math.min(sx, sy) / Math.max(sx, sy)))
}

/** Windows whose size fits this stream as well as the pick does. */
export function matchingWindows(stream: { width: number; height: number }, snapshot: CaptureTargetSnapshot | null | undefined): HyprClient[] {
  const clients = snapshot?.clients ?? []
  const seen = new Set<string>()
  return clients.filter((c) => {
    if (c.mapped === false || c.hidden || !c.address || seen.has(c.address)) return false
    seen.add(c.address)
    return windowSizeMismatch(stream, c, monitorScaleFor(c, snapshot?.monitors ?? [])) <= WINDOW_SIZE_TOLERANCE
  })
}

/**
 * Whether the selected window covers this monitor completely, in the monitor's own logical
 * coordinates. A maximized window and its monitor then describe the same rectangle, which is
 * the case the ambiguity rule below must not refuse.
 */
export function windowCoversMonitor(client: HyprClient, monitor: HyprMonitor): boolean {
  const scale = monitor.scale || 1
  const rotated = monitor.transform !== undefined && monitor.transform % 2 === 1
  const logicalWidth = (rotated ? monitor.height : monitor.width) / scale
  const logicalHeight = (rotated ? monitor.width : monitor.height) / scale
  const near = (a: number, b: number, span: number) => Math.abs(a - b) <= Math.max(2, span * WINDOW_SIZE_TOLERANCE)
  return (
    near(client.size[0], logicalWidth, logicalWidth) &&
    near(client.size[1], logicalHeight, logicalHeight) &&
    near(client.at[0], monitor.x, logicalWidth) &&
    near(client.at[1], monitor.y, logicalHeight)
  )
}

/**
 * Another visible window, or a monitor, fits this stream just as well as the pick.
 *
 * A monitor of the stream's size normally makes the pick ambiguous: tracking the wrong surface
 * would zoom somewhere the viewer never looked. The exception is the window that fills that
 * monitor. Both readings then map to identical pixels, so refusing costs the take its pointer
 * path, its clicks, and with them every click effect and all of auto zoom — which is exactly
 * what a maximized window on a single monitor used to do.
 */
export function ambiguousWindowPick(stream: { width: number; height: number }, selectedAddress: string, snapshot: CaptureTargetSnapshot | null | undefined): boolean {
  if (matchingWindows(stream, snapshot).some((c) => c.address !== selectedAddress)) return true
  const selected = (snapshot?.clients ?? []).find((c) => c.address === selectedAddress)
  return (snapshot?.monitors ?? []).some((m) => {
    const rotated = m.transform !== undefined && m.transform % 2 === 1
    const w = rotated ? m.height : m.width
    const h = rotated ? m.width : m.height
    if (Math.abs(stream.width - w) > 3 || Math.abs(stream.height - h) > 3) return false
    return !(selected && windowCoversMonitor(selected, m))
  })
}

/** Proportional slack between a window's size and the stream's, for rounding only. */
const WINDOW_SIZE_TOLERANCE = 0.02

/** Only map complete window surfaces at their own size (or proportionally scaled); don't guess crops. */
export function regionForWindow(stream: { width: number; height: number }, client: HyprClient, monitorScale = 1): CaptureRegion | null {
  if (windowSizeMismatch(stream, client, monitorScale) > WINDOW_SIZE_TOLERANCE) return null
  const sx = stream.width / client.size[0]
  return { x: client.at[0] * sx, y: client.at[1] * sy(stream, client), width: stream.width, height: stream.height, scale: sx }
}

function sy(stream: { width: number; height: number }, client: HyprClient): number {
  return stream.height / client.size[1]
}

/** True when the window is the one its monitor is currently showing. */
export function windowOnScreen(client: HyprClient, monitors: readonly HyprMonitor[]): boolean {
  if (client.hidden || client.mapped === false) return false
  const monitor = monitors[client.monitor]
  if (!monitor) return true
  const active = monitor.activeWorkspace?.id
  const special = monitor.specialWorkspace?.id
  if (active === undefined && special === undefined) return true
  return client.workspace.id === active || (special !== undefined && special !== 0 && client.workspace.id === special)
}

/**
 * Where a screen point lands in the recorded window's stream, or null when the
 * point is not on that window. Hyprland keeps coordinates for windows on
 * hidden workspaces, so a click on another workspace covers the same screen
 * area: without the on-screen check those clicks would be logged as clicks in
 * the recording and zoomed onto.
 */
export function windowRelativePoint(x: number, y: number, stream: { width: number; height: number }, client: HyprClient, monitors: readonly HyprMonitor[] = []): [number, number] | null {
  if (!windowOnScreen(client, monitors)) return null
  // Once identity is established, resizing is valid. Match the encoder's
  // centered `contain` fit instead of rejecting the new aspect ratio.
  const scale = Math.min(stream.width / client.size[0], stream.height / client.size[1])
  if (![stream.width, stream.height, ...client.size, x, y, ...client.at].every(Number.isFinite) ||
      stream.width <= 0 || stream.height <= 0 || client.size.some(n => n <= 0)) return null
  const localX = x - client.at[0], localY = y - client.at[1]
  if (localX < 0 || localY < 0 || localX >= client.size[0] || localY >= client.size[1]) return null
  return [localX * scale + (stream.width - client.size[0] * scale) / 2,
    localY * scale + (stream.height - client.size[1] * scale) / 2]
}
