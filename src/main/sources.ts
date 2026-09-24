// Capture source discovery: screens (matched to Electron displays) and windows.

import { desktopCapturer, screen, type DesktopCapturerSource, type Display } from 'electron'
import type { SourceInfo } from '@shared/ipc'
import type { CaptureRegion } from '@shared/types'
import { regionForDisplay } from './region-math'
import { snapshotCaptureTargets } from './linux/capture-target'
import { windowDetail, windowPreview, type PreviewClient } from './linux/window-previews'

export { regionForDisplay } from './region-math'
// Window bounds come from the platform: user32/dwmapi on Windows, the
// compositor on Linux (./linux/capture-target.ts).
export { hwndFromSourceId, windowRegion } from './win/window-region'

function displayForScreenSource(source: DesktopCapturerSource, displays: Display[], indexAmongScreens: number): Display | undefined {
  return displays.find((d) => String(d.id) === source.display_id) ?? displays[indexAmongScreens]
}

/**
 * Build the screen rows from Electron's display inventory. Screen capture later
 * resolves the actual DesktopCapturerSource again, so source thumbnails are an
 * enhancement rather than a prerequisite for recording.
 */
export function displaySourceInfos(displays: Display[], primaryId: number, screenSources: DesktopCapturerSource[] = []): SourceInfo[] {
  return displays.map((display, index) => {
    const phys = regionForDisplay(display)
    const source = screenSources.find((candidate) => candidate.display_id === String(display.id)) ?? screenSources[index]
    const thumbnail = source?.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : undefined
    const label = display.id === primaryId ? 'Primary display' : `Display ${index + 1}`
    return {
      id: String(display.id),
      displayId: display.id,
      name: `${label} (${phys.width}×${phys.height})`,
      kind: 'screen' as const,
      thumbnail,
      bounds: { ...display.bounds },
      scaleFactor: display.scaleFactor
    }
  })
}

/**
 * On Wayland every desktopCapturer.getSources call goes through the
 * xdg-desktop-portal picker, and asking for screens and windows together never
 * resolves (the record panel spins forever). Listing therefore skips the portal
 * and offers displays only; the picker appears once, when recording starts.
 */
export function listsThroughPortal(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env): boolean {
  return platform === 'linux' && (env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY))
}

export async function listSources(): Promise<SourceInfo[]> {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  if (listsThroughPortal()) {
    const snapshot = await snapshotCaptureTargets()
    const clients = [...new Map((snapshot?.clients ?? []).filter(c => c.address && c.mapped !== false && !c.hidden).map(c => [c.address!, c])).values()]
    return [
    ...displaySourceInfos(displays, primary.id),
    ...clients.map((c): SourceInfo => ({
      id: `hypr:${c.address}`,
      name: c.title || 'Application window',
      kind: 'window',
      detail: windowDetail(c)
    })),
    ...(clients.length ? [] : [{ id: 'portal:window', name: 'Choose application window…', kind: 'window' as const }])
    ]
  }
  let sources: DesktopCapturerSource[] = []
  try {
    sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false
    })
  } catch (err) {
    // Some Windows/GPU combinations fail while creating thumbnails. The display
    // inventory is still valid and sufficient to start a screen recording.
    console.warn('[sources] previews unavailable; showing displays without thumbnails', err)
  }

  const screenSources = sources.filter((source) => source.id.startsWith('screen:'))
  const out: SourceInfo[] = displaySourceInfos(displays, primary.id, screenSources)
  for (const s of sources) {
    const thumbnail = s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : undefined
    if (!s.id.startsWith('screen:') && s.name && s.name.trim().length > 0) {
      out.push({ id: s.id, name: s.name, kind: 'window', thumbnail })
    }
  }
  return out
}

export function displayById(displayId: number | undefined): Display {
  const displays = screen.getAllDisplays()
  return displays.find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
}

/** desktopCapturer screen source for a display. Falls back to the first screen source. */
export async function findScreenSource(display: Display): Promise<DesktopCapturerSource> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
  if (sources.length === 0) throw new Error('No screen sources available')
  const displays = screen.getAllDisplays()
  const byId = sources.find((s) => s.display_id === String(display.id))
  if (byId) return byId
  const index = displays.findIndex((d) => d.id === display.id)
  return sources[index] ?? sources[0]
}

/**
 * PipeWire exposes one delegated picker for screens and windows. Ask for both
 * only after getDisplayMedia has created a request; calling this while merely
 * resolving the record-panel selection can fail or leave the Hyprland portal
 * waiting without a parent request.
 */
export function portalSourceTypes(kind: 'screen' | 'window' | 'region'): Array<'screen' | 'window'> {
  return kind === 'window' ? ['window'] : ['screen']
}

export async function findPortalSource(kind: 'screen' | 'window' | 'region'): Promise<DesktopCapturerSource> {
  const sources = await desktopCapturer.getSources({ types: portalSourceTypes(kind), thumbnailSize: { width: 0, height: 0 } })
  if (sources.length === 0) throw new Error('No screen or window was selected')
  return sources[0]
}

export async function findWindowSource(sourceId: string): Promise<DesktopCapturerSource> {
  const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })
  const match = sources.find((s) => s.id === sourceId)
  if (!match) throw new Error(`Window source not found: ${sourceId}`)
  return match
}

/**
 * Pictures of the listed windows, fetched only when the record panel opens its
 * window list. Listing stays instant, nothing is captured unless the user asks
 * to see it, and a few run at a time so a desktop full of windows does not
 * start a screenshot process for each one at once.
 */
export const PREVIEW_CONCURRENCY = 4

export async function windowPreviews(ids: readonly string[]): Promise<Record<string, string>> {
  if (!listsThroughPortal() || ids.length === 0) return {}
  const snapshot = await snapshotCaptureTargets()
  const byId = new Map((snapshot?.clients ?? []).filter((c) => c.address).map((c) => [`hypr:${c.address}`, c as PreviewClient]))
  const wanted = ids.filter((id) => byId.has(id))
  const out: Record<string, string> = {}
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(PREVIEW_CONCURRENCY, wanted.length) }, async () => {
      while (next < wanted.length) {
        const id = wanted[next++]
        const preview = await windowPreview(byId.get(id)!)
        if (preview) out[id] = preview
      }
    })
  )
  return out
}
