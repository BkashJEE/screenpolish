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
