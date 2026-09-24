// Zoom templates: one click sets scale, motion and camera feel together.
import type { Project } from './types'

export interface ZoomTemplate {
  id: string
  name: string
  blurb: string
  values: Pick<Project['zoom'], 'scale' | 'motion' | 'easeSec' | 'follow'>
}

export const ZOOM_TEMPLATES: readonly ZoomTemplate[] = [
  { id: 'smart', name: 'Smart clicks', blurb: 'Hold nearby clicks, pan to new areas, return wide after pauses. Add accents manually.', values: { scale: 1.8, motion: 'smart', easeSec: 0.65, follow: 0.15 } },
  { id: 'subtle', name: 'Subtle', blurb: 'Gentle 1.4x push, slow ease, barely follows', values: { scale: 1.4, motion: 'zoom', easeSec: 0.85, follow: 0.2 } },
  { id: 'classic', name: 'Classic', blurb: 'Screen Studio style 2x zoom on clicks', values: { scale: 2, motion: 'zoom', easeSec: 0.6, follow: 0.35 } },
  { id: 'cinematic', name: 'Cinematic', blurb: 'Zooms, tilts and slow drifts take turns', values: { scale: 2, motion: 'cinematic', easeSec: 0.7, follow: 0.3 } },
  { id: 'punchy', name: 'Punchy', blurb: 'Snaps in hard on every click, TikTok pace', values: { scale: 2.4, motion: 'punch', easeSec: 0.4, follow: 0.45 } },
  { id: 'follow', name: 'Follow', blurb: 'Camera tracks the cursor closely while zoomed', values: { scale: 1.8, motion: 'zoom', easeSec: 0.5, follow: 0.9 } },
  { id: 'focus', name: 'Focus', blurb: 'Closer 2.7x push that stays locked to the click', values: { scale: 2.7, motion: 'zoom', easeSec: 0.55, follow: 0.15 } },
  { id: 'glide', name: 'Glide', blurb: 'Slow cinematic move with gentle pointer tracking', values: { scale: 2.2, motion: 'cinematic', easeSec: 1, follow: 0.45 } },
  { id: 'macro', name: 'Macro', blurb: 'Fast 3.4x close-up for small controls and details', values: { scale: 3.4, motion: 'punch', easeSec: 0.3, follow: 0.55 } }
]

export function applyZoomTemplate(project: Project, id: string): Project {
  const t = ZOOM_TEMPLATES.find((x) => x.id === id)
  if (!t) return project
  return { ...project, zoom: { ...project.zoom, enabled: true, ...(t.id === 'smart' ? { auto: true } : {}), ...t.values, template: t.id } }
}

/** The template whose values match the current zoom settings, or null when customised. */
export function matchZoomTemplate(zoom: Project['zoom']): ZoomTemplate | null {
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  return (
    ZOOM_TEMPLATES.find((t) => near(t.values.scale, zoom.scale) && t.values.motion === zoom.motion && near(t.values.easeSec, zoom.easeSec ?? 0.6) && near(t.values.follow, zoom.follow ?? 0.35)) ?? null
  )
}
