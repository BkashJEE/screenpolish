/**
 * A tiny picture of a frame, for telling apart windows that are the same size.
 *
 * The share portal never says which window the dialog handed over, and the
 * stream's size is all ScreenPolish can see of it. When two windows share that
 * size (tiled layouts make this common) size cannot decide between them. What
 * they show can: the first recorded frame is reduced to a small grey grid, each
 * candidate window is captured and reduced the same way, and the closest one
 * wins — but only when it wins clearly.
 *
 * Values are normalised (mean 0, spread 1) before comparing, so a window that
 * brightens between the two captures, or a stream with a different colour
 * range, still matches itself.
 */

export const FINGERPRINT_WIDTH = 32
export const FINGERPRINT_HEIGHT = 24
export const FINGERPRINT_LENGTH = FINGERPRINT_WIDTH * FINGERPRINT_HEIGHT

/** The best match must correlate at least this well with the stream... */
export const MIN_MATCH = 0.6
/** ...and beat the runner-up by at least this much, or nothing is chosen. */
export const MIN_MARGIN = 0.15
/**
 * When a candidate could not be captured there is nothing to compare it with,
 * so the stream might be that window. Only a near-certain match may win then.
 */
export const MIN_MATCH_WITH_UNSEEN = 0.85

export type ChannelOrder = 'rgba' | 'bgra'

/**
 * Luminance of every pixel of a buffer already scaled to the fingerprint grid.
 * Returns null for a buffer of the wrong size, so a bad capture never matches.
 */
export function fingerprintFromPixels(data: ArrayLike<number>, order: ChannelOrder = 'rgba'): number[] | null {
  if (data.length !== FINGERPRINT_LENGTH * 4) return null
  const r = order === 'rgba' ? 0 : 2
  const b = order === 'rgba' ? 2 : 0
  const out = new Array<number>(FINGERPRINT_LENGTH)
  for (let i = 0; i < FINGERPRINT_LENGTH; i++) {
    const p = i * 4
    out[i] = 0.2126 * data[p + r] + 0.7152 * data[p + 1] + 0.0722 * data[p + b]
  }
  return out
}

/** Pearson correlation of two fingerprints, -1..1. A flat (single-colour) picture carries no information and scores 0. */
export function fingerprintSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== FINGERPRINT_LENGTH || b.length !== FINGERPRINT_LENGTH) return 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < FINGERPRINT_LENGTH; i++) {
    ma += a[i]
    mb += b[i]
  }
  ma /= FINGERPRINT_LENGTH
  mb /= FINGERPRINT_LENGTH
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < FINGERPRINT_LENGTH; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  if (va < 1e-6 || vb < 1e-6) return 0
  return cov / Math.sqrt(va * vb)
}

/**
 * The candidate that clearly shows what the stream shows, or null when none
 * does or two are too close to call. Guessing wrong would zoom on clicks in a
 * window that is not in the video, which is worse than no auto zoom.
 */
export function pickByFingerprint<T extends { fingerprint: readonly number[] | null }>(stream: readonly number[] | null | undefined, candidates: readonly T[]): T | null {
  if (!stream || stream.length !== FINGERPRINT_LENGTH) return null
  const unseen = candidates.some((c) => c.fingerprint === null)
  const scored = candidates
    .filter((c) => c.fingerprint !== null)
    .map((c) => ({ c, score: fingerprintSimilarity(stream, c.fingerprint!) }))
    .sort((x, y) => y.score - x.score)
  const best = scored[0]
  if (!best || best.score < (unseen ? MIN_MATCH_WITH_UNSEEN : MIN_MATCH)) return null
  const runnerUp = scored[1]?.score ?? -1
  return best.score - runnerUp >= MIN_MARGIN ? best.c : null
}
