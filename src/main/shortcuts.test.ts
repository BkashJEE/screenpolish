import { expect, it, vi } from 'vitest'
import { shortcutManager } from './shortcuts'
import { DEFAULT_SHORTCUTS } from '@shared/shortcuts'
it('restores the previous registration after a conflict',()=>{
  const registry={register:vi.fn((key:string)=>key!=='Super+F8'),unregisterAll:vi.fn()}
  const apply=shortcutManager(registry,{record:vi.fn(),pause:vi.fn(),stop:vi.fn()})
  apply(DEFAULT_SHORTCUTS)
  expect(()=>apply({...DEFAULT_SHORTCUTS,record:'Super+F8'})).toThrow('unavailable')
  expect(registry.register.mock.calls.slice(-3).map(call=>call[0])).toEqual(Object.values(DEFAULT_SHORTCUTS))
})
