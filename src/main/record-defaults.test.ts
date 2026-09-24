import { describe, expect, it } from 'vitest'
import { FALLBACK_DEFAULTS, resolveDeviceChoice, sanitizeDefaults } from './record-defaults'

describe('sanitizeDefaults', () => {
  it('falls back field by field', () => {
    expect(sanitizeDefaults(null)).toEqual(FALLBACK_DEFAULTS)
    expect(sanitizeDefaults({ mic: 'abc', fps: 60, system: false })).toEqual({ mic: 'abc', webcam: 'default', system: false, fps: 60 })
    expect(sanitizeDefaults({ fps: 24, webcam: 7 })).toEqual(FALLBACK_DEFAULTS)
  })
})

describe('resolveDeviceChoice', () => {
  it('maps auto to default, keeps ids, drops empty', () => {
    expect(resolveDeviceChoice('auto')).toBe('default')
    expect(resolveDeviceChoice('abc123')).toBe('abc123')
    expect(resolveDeviceChoice('')).toBeNull()
  })
})
