import { describe, expect, it } from 'vitest'
import { createSaveGate } from './save-gate'

describe('createSaveGate', () => {
  const loaded = { v: 0 }
  const edited = { v: 1 }

  it('does not re-save the loaded project', () => {
    expect(createSaveGate(loaded).shouldSave(loaded)).toBe(false)
  })

  it('saves an edit, and saves an Undo back to the loaded project', () => {
    const gate = createSaveGate(loaded)
    expect(gate.shouldSave(edited)).toBe(true)
    // Before the fix, returning to the loaded object was skipped and the edit stayed on disk.
    expect(gate.shouldSave(loaded)).toBe(true)
  })

  it('does not queue the same state twice in a row', () => {
    const gate = createSaveGate(loaded)
    expect(gate.shouldSave(edited)).toBe(true)
    expect(gate.shouldSave(edited)).toBe(false)
  })
})
