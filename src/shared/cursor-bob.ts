/** Deterministic secondary motion around the pointer tip, never its position.
 * Subtle breathing/rocking at rest; a short squash and rebound after a click. */
export function cursorBobAt(time: number, clickAge: number) {
  const t = Number.isFinite(time) ? time : 0
  const phase = t * Math.PI * 2 / 1.8
  const click = clickAge >= 0 && clickAge < 0.42
    ? Math.sin(clickAge / 0.42 * Math.PI * 2) * Math.exp(-clickAge * 6)
    : 0
  return {
    rotation: Math.sin(phase) * 0.045,
    scaleX: 1 + Math.sin(phase) * 0.025 + click * 0.12,
    scaleY: 1 + Math.sin(phase) * 0.04 - click * 0.2
  }
}
