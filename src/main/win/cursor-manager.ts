// Linux edition: Wayland has no SetSystemCursor, so nothing blanks the system
// cursor here. gpu-screen-recorder records without it instead
// (src/main/linux/gsr.ts), and the renderer draws the pointer.

export function markerPath(): string {
  return ''
}
export function isCursorHidden(): boolean {
  return false
}
export function hideSystemCursor(): void {}
export function restoreSystemCursor(): void {}
export function recoverCursorsIfNeeded(): boolean {
  return false
}
