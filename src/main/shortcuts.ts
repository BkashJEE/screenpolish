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

/**
 * The hotkeys recording cannot do without. A conflict on one of these is worth
 * stopping for, because without it the user cannot start or stop a take.
 */
export const ESSENTIAL_SHORTCUTS: ReadonlyArray<keyof RecordingShortcuts> = ['record', 'pause', 'stop']

type Essential = 'record' | 'pause' | 'stop'
export type ShortcutHandlers = Record<Essential, () => void> & Partial<Record<Exclude<keyof RecordingShortcuts, Essential>, () => void>>

/**
 * Register the hotkeys.
 *
 * An optional action with no handler is not registered at all - the replay
 * shortcut on a platform without a replay buffer. Grabbing a global key for a
 * feature that cannot run there would only take it away from every other app.
 *
 * An optional action whose key is already taken is skipped rather than fatal.
 * Every shortcut used to be treated as essential, so one conflict on the replay
 * key aborted the lot - and on a first start, with nothing to fall back to, that
 * left record, pause and stop all unregistered.
 */
export function shortcutManager(registry: Registry, handlers: ShortcutHandlers, warn: (message: string) => void = console.warn) {
  let current: RecordingShortcuts | null = null
  const register = (keys: RecordingShortcuts) => {
    for (const action of Object.keys(keys) as Array<keyof RecordingShortcuts>) {
      const handler = handlers[action]
      if (!handler) continue
      if (registry.register(keys[action], handler)) continue
      if (ESSENTIAL_SHORTCUTS.includes(action)) {
        throw new Error(`Shortcut ${keys[action]} is unavailable. Choose another combination or check the desktop shortcut portal.`)
      }
      warn(`[shortcuts] ${keys[action]} for ${action} is taken by another app; carrying on without it`)
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
