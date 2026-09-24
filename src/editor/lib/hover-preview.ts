// Timing for the library's hover preview. Resting on a card opens it after a
// short pause, so sweeping the pointer across the grid does not flash a video
// per card; once one is open, moving to another card switches at once, like
// browsing with Quick Look. Leaving the cards closes it after a short grace
// so crossing the gap between two cards does not close and reopen it.

export const PREVIEW_OPEN_DELAY_MS = 350
export const PREVIEW_CLOSE_GRACE_MS = 120

/** Delay before showing a card's preview, given whether one is already showing. */
export function previewOpenDelay(showing: boolean): number {
  return showing ? 0 : PREVIEW_OPEN_DELAY_MS
}

/**
 * Where to seek for a pointer at `fraction` across the card (0 left, 1 right).
 * Stops just short of the end so a looping video does not jump back to 0.
 */
export function previewSeekTime(fraction: number, duration: number): number | null {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fraction)) return null
  const f = Math.min(1, Math.max(0, fraction))
  return Math.min(duration - 0.05, f * duration)
}
