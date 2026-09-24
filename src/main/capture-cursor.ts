/**
 * Whether the platform capture stream already contains a pointer.
 *
 * Portal cursor inclusion varies by source and backend. Prefer reported stream
 * metadata. Unreported Linux streams retain the legacy tracked-cursor fallback.
 */
export function cursorBakedIntoCapture(platform: NodeJS.Platform, systemCursorHidden: boolean, cursorMode?: 'always' | 'motion' | 'never'): boolean {
  if (cursorMode) return cursorMode !== 'never'
  if (platform === 'linux') return false
  return !systemCursorHidden
}

/** Correct recordings made by older Linux builds that marked the absent portal cursor as baked. */
export function cursorBakedForPlayback(platform: NodeJS.Platform, recorded: boolean | undefined, cursorMode?: 'always' | 'motion' | 'never'): boolean {
  if (cursorMode) return cursorMode !== 'never'
  return platform === 'linux' ? false : recorded === true
}

/**
 * Linux/PipeWire masks content-protected Electron windows instead of excluding
 * them. A region outline covering the capture therefore becomes a solid green
 * recording, and the HUD/camera bubble become dark patches.
 */
export function canShowCaptureExcludedOverlays(platform: NodeJS.Platform): boolean {
  return platform !== 'linux'
}
