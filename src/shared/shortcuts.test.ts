import { describe, expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, validateShortcuts } from './shortcuts'
it('accepts custom modifiers and function keys', () => {
  expect(validateShortcuts({ ...DEFAULT_SHORTCUTS, record: 'Super+F8' }).record).toBe('Super+F8')
})
it('rejects invalid and duplicate accelerators including aliases', () => {
  expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, record: 'R' })).toThrow()
  expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, pause: 'Ctrl+Shift+R' })).toThrow()
})

describe('the replay shortcut joins the set', () => {
  it('has a default of its own', () => {
    expect(DEFAULT_SHORTCUTS.saveReplay).toBe('CommandOrControl+Shift+B')
    expect(validateShortcuts(DEFAULT_SHORTCUTS).saveReplay).toBe('CommandOrControl+Shift+B')
  })

  it('must differ from the other three, not just from two of them', () => {
    expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, saveReplay: DEFAULT_SHORTCUTS.record })).toThrow()
    expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, saveReplay: DEFAULT_SHORTCUTS.stop })).toThrow()
    expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, saveReplay: DEFAULT_SHORTCUTS.pause })).toThrow()
  })

  it('catches a clash written a different way, since Ctrl and Control are the same key', () => {
    expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, saveReplay: 'Ctrl+Shift+R' })).toThrow()
  })

  it('is held to the same shape as the rest', () => {
    expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, saveReplay: 'B' })).toThrow()
  })
})
