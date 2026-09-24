// Zoom-segment editing on the scrub bar. Pure, tested.
//
// The resolved segment list (auto + manual, removedAuto applied) comes from
// shared/zoom-planner. This module only knows how to hit-test that list and how
// to express user edits as immutable Project updates.

import type { Project, ZoomSegment } from '../../shared/types'
import { clamp } from './time'

export const DEFAULT_SEGMENT_LENGTH = 2.5
export const MIN_SEGMENT_LENGTH = 0.3

/** Keep a source-space focus point inside the captured region. */
export function clampFocus(point: { x: number; y: number }, region: { width: number; height: number }): { x: number; y: number } {
  const width = Number.isFinite(region.width) ? Math.max(0, region.width) : 0
  const height = Number.isFinite(region.height) ? Math.max(0, region.height) : 0
  return {
    x: Number.isFinite(point.x) ? clamp(point.x, 0, width) : width / 2,
    y: Number.isFinite(point.y) ? clamp(point.y, 0, height) : height / 2
  }
}

let counter = 0
export function newSegmentId(): string {
  counter += 1
  return `m-${Date.now().toString(36)}-${counter.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** First segment containing t (inclusive start, exclusive end), or null. */
export function segmentAt(segments: ZoomSegment[], t: number): ZoomSegment | null {
  for (const s of segments) if (t >= s.start && t < s.end) return s
  return null
}

export type ScrubHit =
  | { kind: 'trim-start' }
  | { kind: 'trim-end' }
  | { kind: 'segment-start'; segment: ZoomSegment }
  | { kind: 'segment-end'; segment: ZoomSegment }
  | { kind: 'segment'; segment: ZoomSegment }
  | { kind: 'empty'; t: number }

/**
 * What lies under pixel x on a bar `width` px wide showing [0, duration].
 * Handles win over segment edges, edges win over bodies. `handlePx` is the grab
 * tolerance in pixels on each side of a handle or edge.
 */
export function hitTestScrub(args: {
  x: number
  width: number
  duration: number
  trim: { start: number; end: number }
  segments: ZoomSegment[]
  handlePx?: number
  /** When false the trim handles are not considered (e.g. the zoom lane). */
  includeTrim?: boolean
}): ScrubHit {
  const { x, width, duration, trim, segments } = args
  const handlePx = args.handlePx ?? 6
  const includeTrim = args.includeTrim ?? true
  if (!(duration > 0) || !(width > 0)) return { kind: 'empty', t: 0 }
  const px = (t: number) => (t / duration) * width
  const t = clamp(x / width, 0, 1) * duration

  if (includeTrim) {
    if (Math.abs(x - px(trim.start)) <= handlePx) return { kind: 'trim-start' }
    if (Math.abs(x - px(trim.end)) <= handlePx) return { kind: 'trim-end' }
  }

  // Edges first so a short segment can still be resized.
  for (const s of segments) {
    if (Math.abs(x - px(s.start)) <= handlePx) return { kind: 'segment-start', segment: s }
    if (Math.abs(x - px(s.end)) <= handlePx) return { kind: 'segment-end', segment: s }
  }
  const body = segmentAt(segments, t)
  if (body) return { kind: 'segment', segment: body }
  return { kind: 'empty', t }
}

/**
 * Which trim handle, if any, is under (x, y). The handles are drawn across
 * every lane, from `top` to `bottom`, so they must win over whatever lane the
 * pointer is in; testing them only inside the zoom lane left the grip, which
 * sits mid-height in the overlay lane, impossible to drag.
 */
export function trimHandleHit(args: {
  x: number
  y: number
  width: number
  duration: number
  trim: { start: number; end: number }
  top: number
  bottom: number
  handlePx?: number
}): 'trim-start' | 'trim-end' | null {
  const { x, y, width, duration, trim, top, bottom } = args
  if (!(duration > 0) || !(width > 0) || y < top || y > bottom) return null
  const handlePx = args.handlePx ?? 6
  const px = (t: number) => (t / duration) * width
  const toStart = Math.abs(x - px(trim.start))
  const toEnd = Math.abs(x - px(trim.end))
  if (toStart > handlePx && toEnd > handlePx) return null
  // A very short trim puts both handles under the pointer: take the nearer.
  return toStart <= toEnd ? 'trim-start' : 'trim-end'
}

/** Clamp a segment into [0, duration] keeping at least MIN_SEGMENT_LENGTH. */
export function clampSegment(seg: ZoomSegment, duration: number): ZoomSegment {
  const d = duration > 0 ? duration : Math.max(seg.end, seg.start + MIN_SEGMENT_LENGTH)
  let start = clamp(seg.start, 0, d)
  let end = clamp(seg.end, 0, d)
  if (end - start < MIN_SEGMENT_LENGTH) {
    end = Math.min(d, start + MIN_SEGMENT_LENGTH)
    start = Math.max(0, end - MIN_SEGMENT_LENGTH)
  }
  return { ...seg, start, end }
}

/**
 * Shift a whole segment to `desiredStart` without changing its length.
 * For a valid segment that fits the recording, the result is clamped to the
 * recording bounds; unlike clampSegment this never grows or shrinks the block.
 */
export function shiftSegment(segment: Pick<ZoomSegment, 'start' | 'end'>, desiredStart: number, duration: number): { start: number; end: number } {
  const length = Math.max(0, segment.end - segment.start)
  const maxStart = Math.max(0, duration - length)
  const start = clamp(desiredStart, 0, maxStart)
  return { start, end: start + length }
}

/**
 * Build a manual segment starting at t. If it would run past the recording it
 * is pulled back so the full length still fits (when the recording is long
 * enough). Focus defaults to the region centre when no pointer sample exists.
 */
export function createManualSegment(args: {
  t: number
  duration: number
  focus: { x: number; y: number } | null
  region: { width: number; height: number }
  scale: number
  length?: number
}): ZoomSegment {
  const length = args.length ?? DEFAULT_SEGMENT_LENGTH
  const focus = args.focus ?? { x: args.region.width / 2, y: args.region.height / 2 }
  let start = Math.max(0, args.t)
  let end = start + length
  if (args.duration > 0 && end > args.duration) {
    end = args.duration
    start = Math.max(0, end - length)
  }
  return clampSegment(
    {
      id: newSegmentId(),
      start,
      end,
      x: focus.x,
      y: focus.y,
      scale: args.scale,
      source: 'manual'
    },
    args.duration
  )
}

export function addManualSegment(project: Project, segment: ZoomSegment): Project {
  const manual = [...project.zoom.manual, { ...segment, source: 'manual' as const }].sort((a, b) => a.start - b.start)
  return { ...project, zoom: { ...project.zoom, manual } }
}

/** Manual → drop from manual. Auto → remember its id in removedAuto. */
export function removeSegment(project: Project, segment: ZoomSegment): Project {
  if (segment.source === 'manual') {
    return { ...project, zoom: { ...project.zoom, manual: project.zoom.manual.filter((s) => s.id !== segment.id) } }
  }
  if (project.zoom.removedAuto.includes(segment.id)) return project
  return { ...project, zoom: { ...project.zoom, removedAuto: [...project.zoom.removedAuto, segment.id] } }
}

export type SegmentPatch = Partial<Pick<ZoomSegment, 'start' | 'end' | 'x' | 'y' | 'scale' | 'style'>>

/**
 * Apply a patch to a segment. Editing an auto segment converts it: the auto id
 * goes to removedAuto and a manual copy (new id) carries the edit. Returns the
 * updated project and the segment as it now exists (so selection can follow it).
 */
export function updateSegment(
  project: Project,
  segment: ZoomSegment,
  patch: SegmentPatch,
  duration: number
): { project: Project; segment: ZoomSegment } {
  if (segment.source === 'manual') {
    let next: ZoomSegment = segment
    const manual = project.zoom.manual.map((s) => {
      if (s.id !== segment.id) return s
      next = clampSegment({ ...s, ...patch }, duration)
      return next
    })
    if (next === segment) {
      // Not found in manual (stale selection): treat as an add.
      next = clampSegment({ ...segment, ...patch }, duration)
      return { project: addManualSegment(project, next), segment: next }
    }
    return { project: { ...project, zoom: { ...project.zoom, manual: manual.sort((a, b) => a.start - b.start) } }, segment: next }
  }
  const converted = clampSegment({ ...segment, ...patch, id: newSegmentId(), source: 'manual' }, duration)
  const withoutAuto = removeSegment(project, segment)
  return { project: addManualSegment(withoutAuto, converted), segment: converted }
}

/** Restore every auto segment the user removed. */
export function restoreAutoSegments(project: Project): Project {
  if (project.zoom.removedAuto.length === 0) return project
  return { ...project, zoom: { ...project.zoom, removedAuto: [] } }
}
