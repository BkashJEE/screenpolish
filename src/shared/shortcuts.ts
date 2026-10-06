export const DEFAULT_SHORTCUTS = {
  record: 'CommandOrControl+Shift+R',
  pause: 'CommandOrControl+Shift+P',
  stop: 'CommandOrControl+Shift+S',
  // The replay buffer is pressed the moment something happens, which is the one
  // time hunting for a window is too slow. B for buffer; R, P and S were taken.
  saveReplay: 'CommandOrControl+Shift+B'
}
export type RecordingShortcuts = typeof DEFAULT_SHORTCUTS

export function validateShortcuts(value: unknown): RecordingShortcuts {
  const raw = value as Partial<RecordingShortcuts> | null
  const result = { ...DEFAULT_SHORTCUTS }
  for (const action of Object.keys(result) as Array<keyof RecordingShortcuts>) {
    const accelerator = raw?.[action]
    if (typeof accelerator !== 'string' || !/^(?:(?:CommandOrControl|Control|Ctrl|Alt|Shift|Super|Command)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space)$/.test(accelerator.trim())) {
      throw new Error(`${action}: use a shortcut such as Control+Shift+R or Super+F8`)
    }
    result[action] = accelerator.trim()
  }
  const actions = Object.keys(result) as Array<keyof RecordingShortcuts>
  const normalized = Object.values(result).map(value => value.replace(/CommandOrControl|Ctrl/g, 'Control').split('+').sort().join('+'))
  if (new Set(normalized).size !== actions.length) throw new Error(`${actions.join(', ')} must each use a different shortcut`)
  return result
}

export function shortcutLabel(value: string): string { return value.replace('CommandOrControl', 'Ctrl').replace('Control', 'Ctrl') }
