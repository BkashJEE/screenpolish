// Linux edition: window rectangles come from Hyprland
// (src/main/linux/capture-target.ts), not user32/dwmapi.

import type { CaptureRegion } from '@shared/types'

export function hwndFromSourceId(_sourceId: string): number | null {
  return null
}

export function windowRegion(_sourceId: string): CaptureRegion | null {
  return null
}
