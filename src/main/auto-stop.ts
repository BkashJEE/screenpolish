/**
 * Stops a take once it has run for a planned length.
 *
 * "Record this plan" asks for a recording of exactly the length the plan
 * chose. The count is of recorded time, so pausing holds it: a 30-second
 * plan paused for a minute in the middle still records 30 seconds.
 */

export interface AutoStopClock {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

const realClock: AutoStopClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout)
}

/** Planned lengths outside this are ignored rather than trusted. */
export const AUTO_STOP_MIN_SEC = 1
export const AUTO_STOP_MAX_SEC = 3600

/** Milliseconds for a requested length, or null when there is no usable one. */
export function autoStopMs(seconds: unknown): number | null {
  const s = Number(seconds)
  if (seconds === undefined || seconds === null || !Number.isFinite(s) || s < AUTO_STOP_MIN_SEC || s > AUTO_STOP_MAX_SEC) return null
  return Math.round(s * 1000)
}

export class AutoStop {
  private remaining: number
  private handle: unknown = null
  private startedAt = 0
  private done = false

  constructor(ms: number, private readonly onFire: () => void, private readonly clock: AutoStopClock = realClock) {
    this.remaining = ms
  }

  /** Start counting; also what resuming after a pause does. */
  run(): void {
    if (this.done || this.handle !== null) return
    this.startedAt = this.clock.now()
    this.handle = this.clock.setTimeout(() => {
      this.handle = null
      this.done = true
      this.onFire()
    }, Math.max(0, this.remaining))
  }

  /** Hold the count while the take is paused. */
  pause(): void {
    if (this.done || this.handle === null) return
    this.clock.clearTimeout(this.handle)
    this.handle = null
    this.remaining -= this.clock.now() - this.startedAt
  }

  /** The take ended some other way; never fire. */
  cancel(): void {
    if (this.handle !== null) this.clock.clearTimeout(this.handle)
    this.handle = null
    this.done = true
  }

  /** Milliseconds of recording left before it stops. */
  get left(): number {
    if (this.done) return 0
    return this.handle === null ? this.remaining : Math.max(0, this.remaining - (this.clock.now() - this.startedAt))
  }
}
