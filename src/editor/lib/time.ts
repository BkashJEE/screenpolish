// Pure time and scrub-bar math. No DOM.

export function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  return v < lo ? lo : v > hi ? hi : v
}

/** Seconds per frame at fps. */
export function frameDuration(fps: number): number {
  return fps > 0 ? 1 / fps : 1 / 30
}

/** Snap a time to the nearest frame boundary at fps. */
export function snapToFrame(t: number, fps: number): number {
  const d = frameDuration(fps)
  return Math.round(t / d) * d
}

/**
 * Format seconds for the transport. Compact by default ("0:04.20"), hours only
 * when needed ("1:02:03.40"). NaN/Infinity render as a dash so a not-yet-probed
 * duration never shows "NaN".
 */
export function formatTime(sec: number, opts: { fraction?: boolean } = {}): string {
  if (!Number.isFinite(sec)) return '--:--'
  const fraction = opts.fraction ?? true
  const s = Math.max(0, sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const whole = Math.floor(s % 60)
  const hundredths = Math.floor((s - Math.floor(s)) * 100)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(whole).padStart(2, '0')
  const base = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
  return fraction ? `${base}.${String(hundredths).padStart(2, '0')}` : base
}

/** Short duration for library cards: "12s", "1m 04s", "1h 02m". */
export function formatDurationShort(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '--'
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

/** Pixel x of time t on a bar of `width` px spanning [0, duration]. */
export function timeToX(t: number, duration: number, width: number): number {
  if (!(duration > 0) || !(width > 0)) return 0
  return clamp(t / duration, 0, 1) * width
}

/** Time at pixel x on a bar of `width` px spanning [0, duration]. */
export function xToTime(x: number, duration: number, width: number): number {
  if (!(duration > 0) || !(width > 0)) return 0
  return clamp(x / width, 0, 1) * duration
}

/** Move by delta seconds, staying inside [lo, hi]. */
export function stepTime(t: number, delta: number, lo: number, hi: number): number {
  return clamp(t + delta, lo, hi)
}

/**
 * Trim in project.json uses end === 0 to mean "to the end". Turn a user-facing
 * absolute end back into that representation when it sits at (or beyond) the
 * duration, so an untouched recording keeps its canonical form.
 */
export function canonicalTrimEnd(end: number, duration: number): number {
  if (!(duration > 0)) return end
  return end >= duration - 1e-3 ? 0 : end
}

/** Resolve a trim into absolute seconds. Mirrors shared/layout effectiveTrim. */
export function resolveTrim(trim: { start: number; end: number }, duration: number): { start: number; end: number } {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0
  const end = trim.end > 0 ? Math.min(trim.end, d || trim.end) : d
  const start = clamp(trim.start, 0, end)
  return { start, end: Math.max(end, start) }
}

/** Human-readable elapsed clock for the recording banner: "0:42", "12:03". */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
