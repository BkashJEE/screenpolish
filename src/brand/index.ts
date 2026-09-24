// Empty brand pack surface. Same exports as a real pack, all inert.

export * from './pack'
export { PACK_PLATE_INK, PACK_BANNER_WIDTH, drawBrandLettering } from './draw'
export { drawKnight, knightSprite, setKnightSprites, type KnightPose } from './sprites'

export const KNIGHT_CAST_SEC = 0.4

export function knightPoseAt(_clickAge: number): 'idle' | 'cast' {
  return 'idle'
}

export async function preloadBrandSprites(_loadImage: (url: string) => Promise<CanvasImageSource>): Promise<void> {}
