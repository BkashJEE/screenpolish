import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isFolderName, readLastEdited, writeLastEdited } from './last-edited'

describe('isFolderName', () => {
  it('accepts a recording folder name', () => {
    expect(isFolderName('2026-09-24_22-33-45')).toBe(true)
  })

  it('rejects paths, traversal and anything that is not a string', () => {
    for (const bad of ['', '.', '..', 'a/b', 'a\\b', '/abs/path', 42, null, undefined]) expect(isFolderName(bad)).toBe(false)
  })
})

describe('remembering the last edited recording', () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k)
    })
  })

  it('round-trips a folder', () => {
    writeLastEdited('2026-09-24_22-33-45')
    expect(readLastEdited()).toBe('2026-09-24_22-33-45')
  })

  it('forgets on null, and never returns something unusable', () => {
    writeLastEdited('take')
    writeLastEdited(null)
    expect(readLastEdited()).toBeNull()
    writeLastEdited('../escape')
    expect(readLastEdited()).toBeNull()
  })

  it('survives storage that throws, as in a private window', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') }
    })
    expect(() => writeLastEdited('take')).not.toThrow()
    expect(readLastEdited()).toBeNull()
  })
})
