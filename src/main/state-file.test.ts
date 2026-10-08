import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { STATE_FILE, removeStateFile, stateFileBody, writeStateFile } from './state-file'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-state-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const read = (): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(dir, STATE_FILE), 'utf8')) as Record<string, unknown>

describe('state file', () => {
  it('holds what `status` prints, plus the pid, on one line', () => {
    const body = stateFileBody({ status: 'recording', folder: '/r/t', startedAt: 1000, paused: false }, 42, '/r/prev')
    expect(body.endsWith('\n')).toBe(true)
    expect(body.trim().split('\n')).toHaveLength(1)
    expect(JSON.parse(body)).toEqual({ ok: true, pid: 42, state: { status: 'recording', folder: '/r/t', startedAt: 1000, paused: false }, lastFolder: '/r/prev' })
  })

  it('follows every state change, replacing the file whole', () => {
    writeStateFile(dir, { status: 'idle' }, 7, null)
    expect(read()).toMatchObject({ pid: 7, state: { status: 'idle' } })
    writeStateFile(dir, { status: 'countdown', seconds: 3 }, 7, null)
    expect(read()).toMatchObject({ state: { status: 'countdown', seconds: 3 } })
    // No temporary file is left beside it.
    expect(fs.readdirSync(dir)).toEqual([STATE_FILE])
  })

  it('creates its folder, and is gone after removal', () => {
    const nested = path.join(dir, 'cli')
    writeStateFile(nested, { status: 'idle' }, 1, null)
    expect(fs.existsSync(path.join(nested, STATE_FILE))).toBe(true)
    removeStateFile(nested)
    expect(fs.existsSync(path.join(nested, STATE_FILE))).toBe(false)
    removeStateFile(nested) // twice is fine
  })

  it('never throws when the disk refuses', () => {
    const broken = {
      mkdirSync: () => undefined,
      writeFileSync: () => { throw new Error('EROFS') },
      renameSync: () => undefined,
      rmSync: () => { throw new Error('EROFS') }
    }
    expect(() => writeStateFile(dir, { status: 'idle' }, 1, null, broken)).not.toThrow()
    expect(() => removeStateFile(dir, broken)).not.toThrow()
  })
})
