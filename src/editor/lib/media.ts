// Renderer-only media helpers (DOM + mediabunny). Not unit-tested: no jsdom.

import { ALL_FORMATS, Input, UrlSource } from 'mediabunny'
import type { Overlay } from '../../shared/types'
import { imageUrlForPath } from './project'

/**
 * Exact duration of a media URL. A fragmented MP4 written by a live recording
 * has no duration in its moov, so <video>.duration reports Infinity; mediabunny
 * walks the fragments and returns the real number.
 */
export async function probeDuration(url: string): Promise<number> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS })
  try {
    const d = await input.computeDuration()
    if (!Number.isFinite(d) || d <= 0) throw new Error('duration unavailable')
    return d
  } finally {
    input.dispose()
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // The editor is http://localhost in dev and file:// when packaged, while
    // bundled/user images are polish://. Request CORS mode before assigning
    // src so drawing the image does not taint preview/export canvases.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image ${url}`))
    img.src = url
  })
}

/** File name without directory, for labels. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

/**
 * Decode every image overlay's file into a map keyed by its path. Paths already
 * present in `existing` are reused; a file that fails to load is left out so
 * the renderer skips it.
 */
export async function loadOverlayImages(overlays: readonly Overlay[], existing?: ReadonlyMap<string, CanvasImageSource>): Promise<Map<string, CanvasImageSource>> {
  const out = new Map<string, CanvasImageSource>()
  const pending: Array<Promise<void>> = []
  for (const o of overlays) {
    if (o.kind !== 'image' || !o.content || out.has(o.content)) continue
    const have = existing?.get(o.content)
    if (have) {
      out.set(o.content, have)
      continue
    }
    pending.push(
      loadImage(imageUrlForPath(o.content))
        .then((img) => void out.set(o.content, img))
        .catch(() => undefined)
    )
  }
  await Promise.all(pending)
  return out
}
