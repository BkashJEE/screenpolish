// Empty brand pack: this edition ships no themed extras.
//
// The app reads these lists rather than naming a theme, so an empty pack simply
// means the background cards show the Omarchy theme alone and the cursor picker
// offers the built-in pointers. See src/brand in the private repository for the
// shape a pack takes.

import type { CursorSkin } from '../shared/ipc'
import type { CursorStyle } from '../shared/types'

export interface BrandTheme {
  id: string
  name: string
  path: string
  letteringLabel: string
}

export interface BrandCursor {
  style: CursorStyle
  label: string
  title?: string
  liveSkin?: CursorSkin
  sprites: string[]
}

export const BRAND_THEMES: BrandTheme[] = []
export const BRAND_CURSORS: BrandCursor[] = []
