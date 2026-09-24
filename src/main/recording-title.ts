// Naming for a finished take. Pure, and shared by every platform: the window
// title it is given comes from the platform source (see win/foreground-title.ts,
// which returns null anywhere but Windows).

/** Human title for a recording: the app/window in front when capture began, trimmed. */
export function recordingTitle(windowTitle: string | null, fallback: string): string {
  const raw = (windowTitle ?? '').replace(/\s+/g, ' ').trim()
  const cleaned = raw.replace(/^[•●*]\s*/, '')
  if (!cleaned) return fallback
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trimEnd()}…` : cleaned
}
