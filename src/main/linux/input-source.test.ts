import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinuxInputSource } from './input-source'

vi.mock('node:fs', () => ({ readFileSync: vi.fn(), openSync: vi.fn(), closeSync: vi.fn(), createReadStream: vi.fn() }))
vi.mock('./hypr', () => ({ isHyprland: () => false, hyprSocketPaths: () => [], cursorPos: vi.fn() }))

describe('Linux mouse-device capability', () => {
  let source: LinuxInputSource
  const handlers = { onMove: vi.fn(), onButton: vi.fn(), onWheel: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    source = new LinuxInputSource()
    vi.mocked(fs.readFileSync).mockReturnValue('H: Handlers=mouse0 event3\n')
  })
  afterEach(() => source.stop())

  it('does not report buttons ready when opening the mouse is denied', () => {
    vi.mocked(fs.openSync).mockImplementation(() => { throw new Error('EACCES') })
    const caps = source.start(handlers)
    expect(caps.buttons).toBe(false)
    expect(caps.reason).toContain('automatic click zoom')
    expect(fs.createReadStream).not.toHaveBeenCalled()
  })

  it('hands an actually opened descriptor to the stream', () => {
    const stream = Object.assign(new EventEmitter(), { destroy: vi.fn() })
    vi.mocked(fs.openSync).mockReturnValue(42)
    vi.mocked(fs.createReadStream).mockReturnValue(stream as unknown as fs.ReadStream)
    expect(source.start(handlers).buttons).toBe(true)
    expect(fs.createReadStream).toHaveBeenCalledWith('/dev/input/event3', { fd: 42, autoClose: true })
    source.stop()
    expect(stream.destroy).toHaveBeenCalled()
  })

  it('closes the descriptor if stream construction fails', () => {
    vi.mocked(fs.openSync).mockReturnValue(42)
    vi.mocked(fs.createReadStream).mockImplementation(() => { throw new Error('stream failed') })
    expect(source.start(handlers).buttons).toBe(false)
    expect(fs.closeSync).toHaveBeenCalledWith(42)
  })

  it('does not open keyboard-only devices', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('H: Handlers=kbd event1\n')
    expect(source.start(handlers).buttons).toBe(false)
    expect(fs.openSync).not.toHaveBeenCalled()
  })
})
