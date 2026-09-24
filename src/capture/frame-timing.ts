/** Preserve elapsed time even when the portal stops delivering frames on a
 * static desktop. Repeating a held frame here is intentional, not dropped motion.
 * Event-only sampling can silently truncate the still tail (or pause interval). */
export function captureFrameRate(fps: number): number {
  return fps
}
