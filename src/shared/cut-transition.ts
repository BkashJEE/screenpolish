/**
 * Transitions that hide a removed clip.
 *
 * Removing a clip leaves a hard cut: the source time jumps while output time
 * runs on, so the picture changes in one frame and the eye reads "something was
 * taken out here". A transition covers that frame.
 *
 * There is one decoder, so a true cross dissolve between two moving clips is
 * not available. Instead the last composed frame before the join is held and
 * dissolved out over the frames after it. Over a fifth of a second a frozen
 * outgoing side is indistinguishable from a moving one, and nothing is lost:
 * the held frame is an overlay, so the export keeps exactly the duration the
 * cuts imply.
 *
 * Everything here is pure and works in output seconds, the clock both the
 * preview loop and the exporter already count in, so the two produce the same
 * picture on both platforms.
 */

import type { SpeedSpan } from './speed'

export type CutTransitionStyle = 'none' | 'dissolve' | 'blur'

export interface CutTransition {
  style: CutTransitionStyle
  /** Seconds the held frame takes to disappear. */
  durationSec: number
}

/** Existing projects keep their hard cuts until the user picks a transition. */
export const DEFAULT_CUT_TRANSITION: CutTransition = { style: 'none', durationSec: 0.25 }

export const MIN_CUT_TRANSITION_SEC = 0.08
export const MAX_CUT_TRANSITION_SEC = 1

/**
 * The held frame never fully covers the incoming one. A frame of total freeze
 * reads as a stutter; starting a little under lets the new clip show through
 * from the first frame.
 */
export const HELD_PEAK = 0.92

const STYLES: readonly CutTransitionStyle[] = ['none', 'dissolve', 'blur']

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export function normalizeCutTransition(value: unknown): CutTransition {
  const raw = (value ?? {}) as Partial<CutTransition>
  const style = STYLES.includes(raw.style as CutTransitionStyle) ? (raw.style as CutTransitionStyle) : DEFAULT_CUT_TRANSITION.style
  const seconds = typeof raw.durationSec === 'number' && Number.isFinite(raw.durationSec) ? raw.durationSec : DEFAULT_CUT_TRANSITION.durationSec
  return { style, durationSec: Math.min(MAX_CUT_TRANSITION_SEC, Math.max(MIN_CUT_TRANSITION_SEC, seconds)) }
}

/** True when this project asks for anything to be drawn over its joins. */
export function cutTransitionActive(transition: CutTransition | undefined): boolean {
  return !!transition && transition.style !== 'none' && transition.durationSec > 0
}

/**
 * Output times where the source jumps because the clip between two spans was
 * removed. A cut at the very start or the very end of the trim moves a boundary
 * rather than joining two pieces, so it produces no join.
 */
export function cutJoins(spans: readonly SpeedSpan[]): number[] {
  const out: number[] = []
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start > spans[i - 1].end + 1e-6) out.push(spans[i].outputStart)
  }
  return out
}

/**
 * How far `outputTime` sits into a transition: 0 at the join, 1 where it ends,
 * null when no join covers it. The nearest preceding join wins, so joins closer
 * together than the duration hand over rather than stack.
 */
export function transitionProgress(outputTime: number, joins: readonly number[], transition: CutTransition | undefined): number | null {
  if (!cutTransitionActive(transition)) return null
  const seconds = transition!.durationSec
  let best: number | null = null
  for (const join of joins) {
    if (outputTime < join - 1e-9 || outputTime >= join + seconds) continue
    if (best === null || join > best) best = join
  }
  return best === null ? null : clamp01((outputTime - best) / seconds)
}

/** Alpha for the held frame: HELD_PEAK at the join, 0 once the transition ends. */
export function heldOpacity(progress: number): number {
  const p = clamp01(progress)
  return HELD_PEAK * (1 - p * p * (3 - 2 * p))
}

/**
 * Blur radius in output pixels for the 'blur' style, peaking at the join. Scaled
 * by the shorter output side so a 720p and a 4K export soften by the same
 * visual amount.
 */
export function transitionBlurPx(progress: number, minOutputSide: number): number {
  const p = clamp01(progress)
  return 0.016 * minOutputSide * (1 - p) * (1 - p)
}

export function cutTransitionLabel(style: CutTransitionStyle): string {
  return style === 'none' ? 'Hard cut' : style === 'dissolve' ? 'Dissolve' : 'Blur dissolve'
}
