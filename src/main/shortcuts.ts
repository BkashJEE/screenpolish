import { DEFAULT_SHORTCUTS, type RecordingShortcuts } from '@shared/shortcuts'

interface Registry { register(key: string, callback: () => void): boolean; unregisterAll(): void }
export function shortcutManager(registry: Registry, handlers: Record<keyof RecordingShortcuts, () => void>) {
  let current: RecordingShortcuts | null = null
  const register = (keys: RecordingShortcuts) => {
    for (const action of Object.keys(keys) as Array<keyof RecordingShortcuts>) {
      if (!registry.register(keys[action], handlers[action])) throw new Error(`Shortcut ${keys[action]} is unavailable. Choose another combination or check the desktop shortcut portal.`)
    }
  }
  return (keys: RecordingShortcuts = DEFAULT_SHORTCUTS) => {
    if (JSON.stringify(keys) === JSON.stringify(current)) return
    registry.unregisterAll()
    try { register(keys); current = { ...keys } }
    catch (error) {
      registry.unregisterAll()
      if (current) register(current)
      throw error
    }
  }
}
