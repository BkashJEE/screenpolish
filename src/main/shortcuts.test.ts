import { describe, expect, it, vi } from 'vitest'
import { shortcutManager, shouldRegisterGlobalShortcuts } from './shortcuts'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'
it('restores the previous registration after a conflict',()=>{
  const registry={register:vi.fn((key:string)=>key!=='Super+F8'),unregisterAll:vi.fn()}
  const apply=shortcutManager(registry,{record:vi.fn(),pause:vi.fn(),stop:vi.fn(),saveReplay:vi.fn()})
  apply(DEFAULT_SHORTCUTS)
  expect(()=>apply({...DEFAULT_SHORTCUTS,record:'Super+F8'})).toThrow('unavailable')
  const count=Object.keys(DEFAULT_SHORTCUTS).length
  expect(registry.register.mock.calls.slice(-count).map(call=>call[0])).toEqual(Object.values(DEFAULT_SHORTCUTS))
})

describe('shouldRegisterGlobalShortcuts', () => {
  it('takes the hotkeys in the installed app', () => {
    expect(shouldRegisterGlobalShortcuts({ packaged: true, env: {} })).toBe(true)
  })

  it('leaves them to the installed app in a development run', () => {
    // Otherwise a test build steals Ctrl+Shift+R and records the owner's next
    // take into a library they are not looking at.
    expect(shouldRegisterGlobalShortcuts({ packaged: false, env: {} })).toBe(false)
  })

  it('lets a development run ask for them', () => {
    expect(shouldRegisterGlobalShortcuts({ packaged: false, env: { POLISH_DEV_SHORTCUTS: '1' } })).toBe(true)
    expect(shouldRegisterGlobalShortcuts({ packaged: false, env: { POLISH_DEV_SHORTCUTS: 'yes' } })).toBe(false)
  })
})

describe('essential and optional shortcuts', () => {
  const handlers = () => ({ record: vi.fn(), pause: vi.fn(), stop: vi.fn() })

  it('keeps record, pause and stop when another app already owns the replay key', () => {
    // The regression: one taken optional key aborted the whole registration,
    // and on a first start nothing was left registered at all.
    const taken = DEFAULT_SHORTCUTS.saveReplay
    const registry = { register: vi.fn((key: string) => key !== taken), unregisterAll: vi.fn() }
    const warn = vi.fn()
    const apply = shortcutManager(registry, { ...handlers(), saveReplay: vi.fn() }, warn)
    expect(() => apply(DEFAULT_SHORTCUTS)).not.toThrow()
    const registered = registry.register.mock.calls.map((c) => c[0])
    expect(registered).toEqual(expect.arrayContaining([DEFAULT_SHORTCUTS.record, DEFAULT_SHORTCUTS.pause, DEFAULT_SHORTCUTS.stop]))
    expect(registry.unregisterAll).toHaveBeenCalledTimes(1) // only the initial clear, never a rollback
    expect(warn).toHaveBeenCalledOnce()
  })

  it('still refuses loudly when an essential key is taken', () => {
    const registry = { register: vi.fn((key: string) => key !== DEFAULT_SHORTCUTS.stop), unregisterAll: vi.fn() }
    expect(() => shortcutManager(registry, handlers())(DEFAULT_SHORTCUTS)).toThrow('unavailable')
  })

  it('never registers a key for an action this platform does not offer', () => {
    // No saveReplay handler, as on Windows and macOS: Ctrl+Shift+B is left to
    // every other app instead of being grabbed for a feature that cannot run.
    const registry = { register: vi.fn((_key: string, _handler: () => void) => true), unregisterAll: vi.fn() }
    shortcutManager(registry, handlers())(DEFAULT_SHORTCUTS)
    expect(registry.register.mock.calls.map((c) => c[0])).not.toContain(DEFAULT_SHORTCUTS.saveReplay)
    expect(registry.register).toHaveBeenCalledTimes(3)
  })
})
