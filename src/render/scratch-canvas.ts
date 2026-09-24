// Scope scratch pixels to their destination. Preview media must never poison an
// export's canvas origin-clean flag. Weak keys release buffers with their owner.
const pools = new WeakMap<object, Map<string, OffscreenCanvas>>()

export function scratchCanvas(owner: object, key: string, width: number, height: number): OffscreenCanvas {
  let pool = pools.get(owner)
  if (!pool) { pool = new Map(); pools.set(owner, pool) }
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height))
  let canvas = pool.get(key)
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h)
    pool.set(key, canvas)
  }
  return canvas
}
