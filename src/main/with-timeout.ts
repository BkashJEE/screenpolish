/** Marker returned when a promise did not settle in time. */
export const TIMED_OUT = Symbol('timed out')

/**
 * Wait for `promise`, but never longer than `ms`.
 *
 * Finalising a recording waits on a recorder exiting, an audio file closing
 * and ffmpeg remuxing. Any of those can fail to settle — a process that died
 * before its exit was observed, a pipe nobody closes — and an await that never
 * returns leaves the session stuck in `finalizing`: the tray says
 * "finishing…", recording is disabled because the app is not idle, and
 * stopping is disabled because it is already stopping. A slow step must cost
 * the take a feature, never the ability to record again.
 *
 * The promise is not cancelled, because none of these are cancellable; it is
 * abandoned, and its rejection is swallowed so it cannot surface later as an
 * unhandled rejection.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined
  const guard = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  try {
    const settled = await Promise.race([promise, guard])
    if (settled === TIMED_OUT) void promise.catch(() => undefined)
    return settled
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Wait for `promise`, or reject with `message` once `ms` has passed.
 *
 * The shape to use when the caller cannot carry on without the result — a
 * capture page that never loaded, say. Use `withTimeout` instead when a slow
 * step should be given up on rather than turned into a failure.
 */
export function withTimeoutOrThrow<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${message} within ${ms / 1000} s`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}
