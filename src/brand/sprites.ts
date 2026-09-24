// Empty brand pack: no sprite pointer, so the renderer keeps drawing the
// built-in ones. drawKnight reporting false is what makes it fall back.

import type { Ctx2D } from '../shared/ctx2d'

export type KnightPose = 'idle' | 'cast'

export function setKnightSprites(_sprites: Partial<Record<KnightPose, CanvasImageSource>>): void {}

export function knightSprite(_pose: KnightPose): CanvasImageSource | null {
  return null
}

export function drawKnight(_ctx: Ctx2D, _x: number, _y: number, _sizePx: number, _pose: KnightPose, _tSec: number): boolean {
  return false
}
