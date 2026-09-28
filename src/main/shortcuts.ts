import { DEFAULT_SHORTCUTS, type RecordingShortcuts } from '@shared/shortcuts'

interface Registry { register(key: string, callback: () => void): boolean; unregisterAll(): void }
/**
 * Whether this run may take the recording hotkeys from the desktop.
 *
 * Global shortcuts are first come, first served: a development instance that
 * registers them steals Ctrl+Shift+R from the installed app, so the owner's
 * next take is recorded by the test build and their library never hears about
 * it. A development run therefore leaves them alone unless it asks for them
 * with POLISH_DEV_SHORTCUTS=1.
 */
export function shouldRegisterGlobalShortcuts(args: { packaged: boolean; env?: NodeJS.ProcessEnv }): boolean {
  if (args.packaged) return true
  return (args.env ?? process.env).POLISH_DEV_SHORTCUTS === '1'
}

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
