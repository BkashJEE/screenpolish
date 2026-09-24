/** Bound playback work, without changing the project or export resolution. */
export function previewSize(output: { width: number; height: number }, playing: boolean, quality: 'sharp' | 'performance' = 'performance') {
  // A pixel budget treats portrait and landscape equally. Performance mode
  // retains the old low-load limit; paused frames always use full resolution.
  const scale = !playing ? 1 : quality === 'sharp'
    ? Math.min(1, Math.sqrt(1920 * 1080 / (output.width * output.height)))
    : Math.min(1, 1280 / output.width, 720 / output.height)
  return { width: Math.max(1, Math.round(output.width * scale)), height: Math.max(1, Math.round(output.height * scale)) }
}

/** UI updates need not rebuild the editor on every decoded video frame. */
export const PREVIEW_UI_INTERVAL_MS = 100

/** Leave decode time for a 60fps source; exports keep the selected frame rate. */
export function shouldRenderPreview(now: number, previous: number): boolean {
  return now - previous >= 1000 / 30 - 2
}

/** Fixed wall-clock deadlines, not "last draw + interval": expensive draws
 * must not accumulate delay or cause catch-up bursts. */
export function previewPacer(fps = 30): (now: number) => boolean {
  const interval = 1000 / fps
  let next = -Infinity
  return (now) => {
    if (now < next - 0.5) return false
    if (!Number.isFinite(next)) next = now + interval
    else next += Math.max(1, Math.floor((now - next + 0.5) / interval) + 1) * interval
    return true
  }
}
