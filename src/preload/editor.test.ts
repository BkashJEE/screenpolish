import { expect, test, vi } from 'vitest'
import { EDITOR, type EditorBridge } from '../shared/ipc'

const electron = vi.hoisted(() => ({
  on: vi.fn(), exposeInMainWorld: vi.fn()
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { on: electron.on }
}))

test('retains a cold-start folder until the editor subscribes', async () => {
  await import('./editor')
  const receive = electron.on.mock.calls.find(([name]) => name === EDITOR.open)![1]
  const bridge = electron.exposeInMainWorld.mock.calls[0][1] as EditorBridge
  receive({}, '/recording')
  const handler = vi.fn()
  const unsubscribe = bridge.onOpen(handler)
  expect(handler).toHaveBeenCalledWith('/recording')
  receive({}, '/next')
  expect(handler).toHaveBeenLastCalledWith('/next')
  unsubscribe()
  receive({}, '')
  expect(handler).toHaveBeenCalledTimes(2)
  const next = vi.fn()
  bridge.onOpen(next)
  expect(next).toHaveBeenCalledWith('')
})
