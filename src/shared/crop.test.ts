import { describe, expect, it } from 'vitest'
import { normalizeCrop } from './crop'

const full = { x: 0, y: 0, width: 1, height: 1 }

describe('normalizeCrop', () => {
  it('defaults missing and malformed crops to the full source', () => {
    expect(normalizeCrop(undefined)).toEqual(full)
    expect(normalizeCrop(null)).toEqual(full)
    expect(normalizeCrop([])).toEqual(full)
    expect(normalizeCrop({ x: 0, y: 0, width: -1, height: 1 })).toEqual(full)
    expect(normalizeCrop({ x: 0, y: 0, width: Number.NaN, height: 1 })).toEqual(full)
    expect(normalizeCrop({ x: 0, y: 0, width: 1, height: Number.POSITIVE_INFINITY })).toEqual(full)
  })

  it('clamps finite coordinates and dimensions to source bounds', () => {
    expect(normalizeCrop({ x: -0.2, y: 0.25, width: 1.4, height: 0.9 })).toEqual({ x: 0, y: 0.25, width: 1, height: 0.75 })
    expect(normalizeCrop({ x: 0.8, y: 0.7, width: 0.5, height: 0.6 })).toEqual({ x: 0.8, y: 0.7, width: 0.19999999999999996, height: 0.30000000000000004 })
    expect(normalizeCrop({ x: 2, y: -1, width: 0.2, height: 0.2 })).toEqual(full)
  })

  it('does not alias the fallback or input object', () => {
    const raw = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    const result = normalizeCrop(raw)
    expect(result).toEqual(raw)
    expect(result).not.toBe(raw)
    expect(normalizeCrop(undefined)).not.toBe(normalizeCrop(undefined))
  })
})
