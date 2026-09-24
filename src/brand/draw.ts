// Empty brand pack: no lettering to draw.

import type { Ctx2D } from '../shared/ctx2d'

export const PACK_PLATE_INK = '#080c10'
export const PACK_BANNER_WIDTH = 0.25

export function drawBrandLettering(
  _ctx: Ctx2D,
  _size: { width: number; height: number },
  _unit: number,
  _place: (box: { width: number; height: number }) => { x: number; y: number }
): void {}
