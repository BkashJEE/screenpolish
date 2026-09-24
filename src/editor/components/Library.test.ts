import { describe, expect, it } from 'vitest'
import {
  LIBRARY_CARD_SIZE_DEFAULT,
  LIBRARY_CARD_SIZE_MAX,
  LIBRARY_CARD_SIZE_MIN,
  loadLibraryCardSize,
  normalizeLibraryCardSize
} from './Library'

describe('library card size preference', () => {
  it('keeps the current appearance as the default and clamps responsive bounds', () => {
    expect(normalizeLibraryCardSize(undefined)).toBe(LIBRARY_CARD_SIZE_DEFAULT)
    expect(normalizeLibraryCardSize('not-a-size')).toBe(LIBRARY_CARD_SIZE_DEFAULT)
    expect(normalizeLibraryCardSize(LIBRARY_CARD_SIZE_MIN - 1)).toBe(LIBRARY_CARD_SIZE_MIN)
    expect(normalizeLibraryCardSize(LIBRARY_CARD_SIZE_MAX + 1)).toBe(LIBRARY_CARD_SIZE_MAX)
    expect(normalizeLibraryCardSize(247)).toBe(247)
  })

  it('loads valid persisted values and safely falls back for malformed storage', () => {
    const storage = { getItem: () => JSON.stringify(310) }
    expect(loadLibraryCardSize(storage)).toBe(310)
    expect(loadLibraryCardSize({ getItem: () => '{bad json' })).toBe(LIBRARY_CARD_SIZE_DEFAULT)
    expect(loadLibraryCardSize({ getItem: () => JSON.stringify(9999) })).toBe(LIBRARY_CARD_SIZE_MAX)
  })

  it('does not require browser storage when rendered outside a browser', () => {
    expect(() => loadLibraryCardSize()).not.toThrow()
    expect(loadLibraryCardSize()).toBe(LIBRARY_CARD_SIZE_DEFAULT)
  })
})