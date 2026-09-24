import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT } from './types'
import { ZOOM_TEMPLATES, applyZoomTemplate, matchZoomTemplate } from './zoom-templates'

describe('zoom templates', () => {
  it('applies every template and matches it back', () => {
    for (const t of ZOOM_TEMPLATES) {
      const p = applyZoomTemplate(DEFAULT_PROJECT, t.id)
      expect(p.zoom.enabled).toBe(true)
      expect(p.zoom.template).toBe(t.id)
      expect(matchZoomTemplate(p.zoom)?.id).toBe(t.id)
    }
  })
  it('reports custom when a knob moved off the template', () => {
    const p = applyZoomTemplate(DEFAULT_PROJECT, 'classic')
    expect(matchZoomTemplate({ ...p.zoom, scale: 2.7 })).toBeNull()
  })
  it('ignores unknown ids', () => {
    expect(applyZoomTemplate(DEFAULT_PROJECT, 'nope')).toBe(DEFAULT_PROJECT)
  })
})
