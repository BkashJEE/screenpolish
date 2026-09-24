import { expect, it } from 'vitest'
import { DEFAULT_SHORTCUTS, validateShortcuts } from './shortcuts'
it('accepts custom modifiers and function keys', () => {
  expect(validateShortcuts({ ...DEFAULT_SHORTCUTS, record: 'Super+F8' }).record).toBe('Super+F8')
})
it('rejects invalid and duplicate accelerators including aliases', () => {
  expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, record: 'R' })).toThrow()
  expect(() => validateShortcuts({ ...DEFAULT_SHORTCUTS, pause: 'Ctrl+Shift+R' })).toThrow()
})
