// Trailing-edge debounce with flush/cancel, used for project autosave. Pure, tested.

export interface Debounced<A extends unknown[]> {
  (...args: A): void
  /** Run the pending call now (if any). */
  flush(): void
  /** Drop the pending call. */
  cancel(): void
  /** Whether a call is waiting. */
  pending(): boolean
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: A | null = null

  const run = () => {
    timer = null
    if (lastArgs === null) return
    const args = lastArgs
    lastArgs = null
    fn(...args)
  }

  const debounced = ((...args: A) => {
    lastArgs = args
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(run, waitMs)
  }) as Debounced<A>

  debounced.flush = () => {
    if (timer === null) return
    clearTimeout(timer)
    run()
  }
  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    lastArgs = null
  }
  debounced.pending = () => timer !== null

  return debounced
}

/** Leading-edge throttle: at most one call per `intervalMs`, last call always wins eventually. */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, intervalMs: number): (...args: A) => void {
  let last = -Infinity
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingArgs: A | null = null
  return (...args: A) => {
    const now = Date.now()
    const elapsed = now - last
    if (elapsed >= intervalMs) {
      last = now
      fn(...args)
      return
    }
    pendingArgs = args
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null
        last = Date.now()
        const a = pendingArgs
        pendingArgs = null
        if (a) fn(...a)
      }, intervalMs - elapsed)
    }
  }
}
