// Linux edition: there is no uiohook here.
//
// The Omarchy edition records input through the compositor and evdev
// (src/main/linux/input-source.ts). This file keeps the shape the input logger
// expects so the platform seam stays in one place.

import type { MouseButton } from '@shared/types'

export interface InputHandlers {
  onMove: (x: number, y: number) => void
  onButton: (x: number, y: number, button: MouseButton, down: boolean) => void
  onWheel: (x: number, y: number, dy: number) => void
  onKey: (key: string, down: boolean) => void
}

export const UIOHOOK_SUPPORTED = false

export async function preloadInputHook(): Promise<void> {}

export class UiohookSource {
  start(_handlers: InputHandlers): void {}
  stop(): void {}
}
