/**
 * Decides which project states need saving. The loaded project is not re-saved,
 * but after any edit every new state is, including an Undo that returns to the
 * loaded state: the file on disk then holds the edit, so skipping that save
 * would bring the undone change back on the next open.
 */
export interface SaveGate<T> {
  /** True when `state` differs from the last state saved or queued for saving. */
  shouldSave(state: T): boolean
}

export function createSaveGate<T>(initial: T): SaveGate<T> {
  let last = initial
  return {
    shouldSave(state) {
      if (state === last) return false
      last = state
      return true
    }
  }
}
