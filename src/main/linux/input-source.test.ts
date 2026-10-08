import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinuxInputSource } from './input-source'

vi.mock('./hypr', () => ({ isHyprland: () => false, hyprSocketPaths: () => [], cursorPos: vi.fn() }))

// FIFOs stand in for /dev/input nodes: a read blocks until something is
// written, exactly like a mouse that is not being touched.
const linux = process.platform === 'linux'

/** One kernel `struct input_event`: 16 bytes of timeval, then type, code, value. */
function inputEvent(type: number, code: number, value: number): Buffer {
  const buf = Buffer.alloc(24)
  buf.writeUInt16LE(type, 16)
  buf.writeUInt16LE(code, 18)
  buf.writeInt32LE(value, 20)
  return buf
}

/** Resolves with how long an ordinary async file operation took, or rejects after `ms`. */
async function fileIoAnswersWithin(ms: number): Promise<number> {
  const t = Date.now()
  return await Promise.race([
    fs.promises.stat(os.tmpdir()).then(() => Date.now() - t),
    new Promise<number>((_, reject) => setTimeout(() => reject(new Error(`file I/O starved for ${ms} ms`)), ms))
  ])
}

describe.skipIf(!linux)('LinuxInputSource reading devices', () => {
  let dir: string
  let writers: number[]
  let source: LinuxInputSource | undefined
  const handlers = { onMove: vi.fn(), onButton: vi.fn(), onWheel: vi.fn() }

  const quietDevices = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => {
      const node = path.join(dir, `event${i}`)
      execFileSync('mkfifo', [node])
      // Hold a writer open, so the reader blocks instead of seeing end-of-file.
      writers.push(fs.openSync(node, fs.constants.O_RDWR))
      return node
    })

  beforeEach(() => {
    vi.clearAllMocks()
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'polish-evdev-'))
    writers = []
    source = undefined
  })
  afterEach(() => {
    source?.stop()
    for (const fd of writers) fs.closeSync(fd)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports clicks from a device', async () => {
    const [node] = quietDevices(1)
    source = new LinuxInputSource({ devices: () => [node!], pointer: false })
    expect(source.start(handlers).buttons).toBe(true)
    fs.writeSync(writers[0]!, Buffer.concat([inputEvent(1, 0x110, 1), inputEvent(1, 0x110, 0)]))
    await vi.waitFor(() => expect(handlers.onButton).toHaveBeenCalledTimes(2))
    expect(handlers.onButton).toHaveBeenNthCalledWith(1, 0, 0, 'left', true)
    expect(handlers.onButton).toHaveBeenNthCalledWith(2, 0, 0, 'left', false)
  })

  it('leaves file I/O working while more quiet devices are open than Node has pool threads', async () => {
    const nodes = quietDevices(6)
    source = new LinuxInputSource({ devices: () => nodes, pointer: false })
    expect(source.start(handlers).buttons).toBe(true)
    await new Promise((r) => setTimeout(r, 150))
    expect(await fileIoAnswersWithin(2000)).toBeLessThan(2000)
  })

  it('frees everything on stop, even from devices that never sent anything', async () => {
    const nodes = quietDevices(6)
    // Several takes in a row, as the app does: each start opens every mouse again.
    for (let take = 0; take < 3; take++) {
      source = new LinuxInputSource({ devices: () => nodes, pointer: false })
      source.start(handlers)
      await new Promise((r) => setTimeout(r, 100))
      source.stop()
    }
    expect(await fileIoAnswersWithin(2000)).toBeLessThan(2000)
    // No reader is left holding a device.
    await vi.waitFor(() => {
      const holders = execFileSync('sh', ['-c', `fuser ${nodes.join(' ')} 2>/dev/null || true`], { encoding: 'utf8' }).trim()
      expect(holders.split(/\s+/).filter((pid) => pid && Number(pid) !== process.pid)).toEqual([])
    })
  })

  it('does not claim clicks when the device cannot be read', () => {
    if (process.getuid?.() === 0) return // root reads anything
    const node = path.join(dir, 'event0')
    fs.writeFileSync(node, '')
    fs.chmodSync(node, 0o000)
    source = new LinuxInputSource({ devices: () => [node], pointer: false })
    const caps = source.start(handlers)
    expect(caps.buttons).toBe(false)
    expect(caps.reason).toContain('automatic click zoom')
  })

  it('says so when there is no device list at all', () => {
    source = new LinuxInputSource({ devices: () => { throw new Error('no /proc') }, pointer: false })
    expect(source.start(handlers).buttons).toBe(false)
  })
})
