/**
 * Where a popover sits next to its trigger.
 *
 * The inspector lives against the right edge of the window, so a popover that
 * simply opens to the right of its control runs off the window: Chromium's own
 * colour picker did exactly that. Placement here keeps the whole popover inside
 * the window, preferring below-and-left-aligned, then flipping or sliding.
 */

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface PopoverPlacement {
  left: number
  top: number
  /** Which side of the anchor the popover ended up on. */
  side: 'below' | 'above'
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n)

export function placePopover(args: {
  anchor: Rect
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  /** Space between anchor and popover, and the smallest gap to a window edge. */
  gap?: number
}): PopoverPlacement {
  const gap = args.gap ?? 8
  const { anchor, size, viewport } = args

  const below = anchor.top + anchor.height + gap
  const above = anchor.top - gap - size.height
  const fitsBelow = below + size.height <= viewport.height - gap
  const fitsAbove = above >= gap
  // Below unless it would overflow and above has room; otherwise clamp below.
  const side: 'below' | 'above' = fitsBelow || !fitsAbove ? 'below' : 'above'
  const top = clamp(side === 'below' ? below : above, gap, Math.max(gap, viewport.height - gap - size.height))

  // Align the left edges, pull left when that overflows, never past the left gap.
  const left = clamp(anchor.left, gap, Math.max(gap, viewport.width - gap - size.width))

  return { left, top, side }
}
