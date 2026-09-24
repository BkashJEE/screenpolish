export function editRegion(region: { start: number; end: number }, delta: number, mode: 'move' | 'start' | 'end', duration: number) {
  const minimum = Math.min(0.1, duration)
  if (mode === 'start') return { start: Math.max(0, Math.min(region.end - minimum, region.start + delta)), end: region.end }
  if (mode === 'end') return { start: region.start, end: Math.min(duration, Math.max(region.start + minimum, region.end + delta)) }
  const shift = Math.max(-region.start, Math.min(duration - region.end, delta))
  return { start: region.start + shift, end: region.end + shift }
}
