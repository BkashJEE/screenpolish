import { describe, expect, it } from 'vitest'
import {
  SPAWN_CLAIM_STALE_MS,
  acquireSingleInstanceLock,
  claimServerSpawn,
  releaseServerSpawn,
  serverExecutable,
  type SpawnClaimFs
} from './server-lock'

/** Enough of fs to exercise the exclusive-create path without touching disk. */
function fakeFs(initial: Record<string, number> = {}): SpawnClaimFs & { files: Map<string, number> } {
  const files = new Map<string, number>(Object.entries(initial))
  let nextFd = 1
  const open = new Map<number, string>()
  return {
    files,
    mkdirSync: () => undefined,
    openSync: (file, flags) => {
      if (flags === 'wx' && files.has(file)) throw new Error('EEXIST')
      files.set(file, 0)
      const fd = nextFd++
      open.set(fd, file)
      return fd
    },
    writeSync: (fd, text) => {
      const file = open.get(fd)
      if (file) files.set(file, Number(text))
    },
    closeSync: (fd) => void open.delete(fd),
    statSync: (file) => {
      if (!files.has(file)) throw new Error('ENOENT')
      return { mtimeMs: files.get(file) as number }
    },
    unlinkSync: (file) => {
      if (!files.delete(file)) throw new Error('ENOENT')
    }
  }
}

describe('acquireSingleInstanceLock', () => {
  it('takes the lock on the first ask', () => {
    let asked = 0
    const ok = acquireSingleInstanceLock(() => (asked++, true), 6, 0, () => undefined)
    expect(ok).toBe(true)
    expect(asked).toBe(1)
  })

  it('keeps asking while a CLI client is holding the lock, then wins', () => {
    let asked = 0
    const ok = acquireSingleInstanceLock(() => ++asked >= 3, 6, 0, () => undefined)
    expect(ok).toBe(true)
    expect(asked).toBe(3)
  })

  it('gives up when another server really does own the lock', () => {
    let asked = 0
    const ok = acquireSingleInstanceLock(() => (asked++, false), 4, 0, () => undefined)
    expect(ok).toBe(false)
    expect(asked).toBe(4)
  })

  it('waits between asks but not after the last one', () => {
    const waits: number[] = []
    acquireSingleInstanceLock(() => false, 3, 250, (ms) => void waits.push(ms))
    expect(waits).toEqual([250, 250])
  })

  it('asks once even when told to try fewer than once', () => {
    let asked = 0
    expect(acquireSingleInstanceLock(() => (asked++, true), 0, 0, () => undefined)).toBe(true)
    expect(asked).toBe(1)
  })
})

describe('claimServerSpawn', () => {
  it('lets the first caller spawn', () => {
    const fsys = fakeFs()
    expect(claimServerSpawn('/u/cli', 1_000, SPAWN_CLAIM_STALE_MS, fsys)).toBe(true)
  })

  it('refuses a second caller, so three quick CLI calls spawn one server', () => {
    const fsys = fakeFs()
    const results = [1_000, 1_010, 1_020].map((t) => claimServerSpawn('/u/cli', t, SPAWN_CLAIM_STALE_MS, fsys))
    expect(results).toEqual([true, false, false])
  })

  it('takes over a claim whose spawn never came up', () => {
    const fsys = fakeFs()
    expect(claimServerSpawn('/u/cli', 1_000, 30_000, fsys)).toBe(true)
    expect(claimServerSpawn('/u/cli', 1_000 + 29_999, 30_000, fsys)).toBe(false)
    expect(claimServerSpawn('/u/cli', 1_000 + 30_000, 30_000, fsys)).toBe(true)
  })

  it('claims again after the previous server released it', () => {
    const fsys = fakeFs()
    expect(claimServerSpawn('/u/cli', 1_000, SPAWN_CLAIM_STALE_MS, fsys)).toBe(true)
    releaseServerSpawn('/u/cli', fsys)
    expect(claimServerSpawn('/u/cli', 1_100, SPAWN_CLAIM_STALE_MS, fsys)).toBe(true)
  })

  it('releasing a claim that was never made is not an error', () => {
    const fsys = fakeFs()
    expect(() => releaseServerSpawn('/u/cli', fsys)).not.toThrow()
  })
})

describe('serverExecutable', () => {
  it('prefers the AppImage on disk over the throwaway mount', () => {
    expect(serverExecutable({ APPIMAGE: '/opt/ScreenPolish.AppImage' }, '/tmp/.mount_abc/screenpolish')).toBe(
      '/opt/ScreenPolish.AppImage'
    )
  })

  it('falls back to execPath everywhere that is not an AppImage', () => {
    expect(serverExecutable({}, '/usr/bin/screenpolish')).toBe('/usr/bin/screenpolish')
    expect(serverExecutable({ APPIMAGE: '' }, '/usr/bin/screenpolish')).toBe('/usr/bin/screenpolish')
  })
})
