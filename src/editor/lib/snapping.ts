export interface SnapPointResult {
  value: number
  target: number | null
}

export interface SnapRangeResult {
  start: number
  end: number
  target: number | null
}

/** Snap one timeline point to the nearest target inside the threshold. */
export function snapTime(value: number, targets: number[], threshold: number): SnapPointResult {
  let target: number | null = null
  let distance = Math.max(0, threshold) + Number.EPSILON
  for (const candidate of targets) {
    if (!Number.isFinite(candidate)) continue
    const next = Math.abs(candidate - value)
    if (next <= threshold && next < distance) {
      target = candidate
      distance = next
    }
  }
  return { value: target ?? value, target }
}

/** Shift a fixed-length block so either edge can magnetize to a target. */
export function snapRange(start: number, end: number, targets: number[], threshold: number): SnapRangeResult {
  const fromStart = snapTime(start, targets, threshold)
  const fromEnd = snapTime(end, targets, threshold)
  const startDelta = fromStart.target === null ? Number.POSITIVE_INFINITY : Math.abs(fromStart.value - start)
  const endDelta = fromEnd.target === null ? Number.POSITIVE_INFINITY : Math.abs(fromEnd.value - end)
  if (!Number.isFinite(startDelta) && !Number.isFinite(endDelta)) return { start, end, target: null }
  const shift = startDelta <= endDelta ? fromStart.value - start : fromEnd.value - end
  return { start: start + shift, end: end + shift, target: startDelta <= endDelta ? fromStart.target : fromEnd.target }
}
