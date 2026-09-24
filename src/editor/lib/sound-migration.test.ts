import { expect, it } from 'vitest'
import { normalizeZoomSound } from './project'

it('preserves legacy whooshes and persists the new selection', () => {
  expect(normalizeZoomSound({ enabled: true, volume: 0.5 })).toEqual({ enabled: true, volume: 0.5, style: 'classic' })
  expect(normalizeZoomSound({ enabled: true, volume: 0.25, style: 'asmr' }).style).toBe('asmr')
})
