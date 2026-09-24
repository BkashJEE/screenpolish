/**
 * Clip slicing: the parts of a take that never reach playback or export.
 *
 * A cut is a source-time range removed from the timeline. Splits are the
 * boundaries the user sliced at; they have no effect on their own and exist so
 * a clip can be selected and removed as one piece. Both use source seconds,
 * the same clock as trim, zoom segments and overlays, so nothing else in the
 * editor needs a second time base.
 *
 * Removal is non-destructive: the recording is untouched, and a removed clip
 * can be restored because its range is still listed.
 */

export interface Cut {
  id: string
  start: number
  end: number
}

/** A selectable piece of the timeline between two boundaries. */
export interface Clip {
  /** Derived from the clip's start, so it survives unrelated edits. */
  id: string
  start: number
  end: number
  /** True when this clip is dropped from playback and export. */
  removed: boolean
}

/** A split closer than this to another boundary is refused, so no sliver clips appear. */
export const MIN_CLIP_LENGTH = 0.15

type Range = { start: number; end: number }

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Sorted, merged, positive-length cuts. Touching or overlapping ranges become one. */
export function normalizeCuts(cuts: readonly Cut[] | undefined): Cut[] {
  if (!Array.isArray(cuts)) return []
  const clean = cuts
    .filter((c) => c && finite(c.start) && finite(c.end) && c.end > c.start)
    .map((c) => ({ id: typeof c.id === 'string' && c.id ? c.id : cutId(c), start: Math.max(0, c.start), end: c.end }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start)
  const out: Cut[] = []
  for (const cut of clean) {
    const last = out.at(-1)
    if (last && cut.start <= last.end + 1e-6) last.end = Math.max(last.end, cut.end)
    else out.push({ ...cut })
  }
  return out
}

/** Split points strictly inside the trim, sorted and de-duplicated. */
export function normalizeSplits(splits: readonly number[] | undefined, trim: Range): number[] {
  if (!Array.isArray(splits)) return []
  const inside = splits.filter((t) => finite(t) && t > trim.start + 1e-3 && t < trim.end - 1e-3).sort((a, b) => a - b)
  const out: number[] = []
  for (const t of inside) if (!out.some((existing) => Math.abs(existing - t) < 1e-3)) out.push(t)
  return out
}

/** The cut containing this source time, if any. */
export function cutAt(time: number, cuts: readonly Cut[]): Cut | null {
  return cuts.find((c) => time >= c.start && time < c.end) ?? null
}

/**
 * The first source time at or after `time` that survives the cuts, walking
 * through back-to-back removals.
 */
export function skipCuts(time: number, cuts: readonly Cut[]): number {
  let t = time
  for (let guard = 0; guard <= cuts.length; guard++) {
    const hit = cutAt(t, cuts)
    if (!hit) return t
    t = hit.end
  }
  return t
}

/** Seconds of [start, end) that survive the cuts. */
export function keptDuration(start: number, end: number, cuts: readonly Cut[] | undefined): number {
  const removed = normalizeCuts(cuts).reduce((sum, c) => sum + Math.max(0, Math.min(end, c.end) - Math.max(start, c.start)), 0)
  return Math.max(0, end - start - removed)
}

/** The clips the trim is sliced into, in order, including removed ones. */
export function clipsFrom(trim: Range, splits: readonly number[] | undefined, cuts: readonly Cut[] | undefined): Clip[] {
  const bounds = [trim.start, ...normalizeSplits(splits, trim), trim.end]
  const merged = normalizeCuts(cuts)
  const out: Clip[] = []
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]
    const end = bounds[i + 1]
    if (end - start <= 1e-6) continue
    out.push({ id: `clip-${Math.round(start * 1000)}`, start, end, removed: cutAt((start + end) / 2, merged) !== null })
  }
  return out
}

/** The clip under this time, or null outside the trim. The trim end belongs to the last clip. */
export function clipAt(time: number, clips: readonly Clip[]): Clip | null {
  const last = clips.at(-1)
  return clips.find((c) => time >= c.start && time < c.end) ?? (last && Math.abs(time - last.end) < 1e-6 ? last : null)
}

/**
 * Slice at `time`. Refused (splits returned unchanged) outside the trim or
 * within MIN_CLIP_LENGTH of an existing boundary.
 */
export function splitAt(time: number, splits: readonly number[] | undefined, trim: Range): number[] {
  const current = normalizeSplits(splits, trim)
  if (!finite(time) || time <= trim.start || time >= trim.end) return current
  const bounds = [trim.start, ...current, trim.end]
  if (bounds.some((b) => Math.abs(b - time) < MIN_CLIP_LENGTH)) return current
  return normalizeSplits([...current, time], trim)
}

/** True when splitAt would add a boundary here. */
export function canSplitAt(time: number, splits: readonly number[] | undefined, trim: Range): boolean {
  return splitAt(time, splits, trim).length !== normalizeSplits(splits, trim).length
}

/** Remove a clip's range. Adjacent removals merge into one cut. */
export function removeClip(clip: Range, cuts: readonly Cut[] | undefined): Cut[] {
  return normalizeCuts([...(cuts ?? []), { id: cutId(clip), start: clip.start, end: clip.end }])
}

/** Bring a clip's range back, keeping any removed time outside the clip. */
export function restoreClip(clip: Range, cuts: readonly Cut[] | undefined): Cut[] {
  const out: Cut[] = []
  for (const cut of normalizeCuts(cuts)) {
    if (cut.end <= clip.start || cut.start >= clip.end) {
      out.push(cut)
      continue
    }
    if (cut.start < clip.start) out.push({ id: cutId({ start: cut.start, end: clip.start }), start: cut.start, end: clip.start })
    if (cut.end > clip.end) out.push({ id: cutId({ start: clip.end, end: cut.end }), start: clip.end, end: cut.end })
  }
  return normalizeCuts(out)
}

/** Remove the split boundary nearest `time` within the tolerance, joining its two clips. */
export function joinAt(time: number, splits: readonly number[] | undefined, toleranceSec: number): number[] {
  const list = [...(splits ?? [])]
  let best = -1
  for (let i = 0; i < list.length; i++) {
    if (Math.abs(list[i] - time) <= toleranceSec && (best < 0 || Math.abs(list[i] - time) < Math.abs(list[best] - time))) best = i
  }
  if (best >= 0) list.splice(best, 1)
  return list
}

function cutId(range: Range): string {
  return `cut-${Math.round(range.start * 1000)}-${Math.round(range.end * 1000)}`
}
