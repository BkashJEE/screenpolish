import { describe, expect, it } from 'vitest'
import { MIN_FREE_BYTES_TO_RECORD, diskVerdict, freeBytes, lowDiskWarning } from './recording-session'

const MB = 1024 ** 2
const GB = 1024 ** 3

describe('diskVerdict', () => {
  it('refuses on a drive with almost nothing left - the case that lost takes silently', () => {
    expect(diskVerdict(0)).toEqual({ action: 'refuse', free: '0 MB' })
    expect(diskVerdict(40 * MB)).toEqual({ action: 'refuse', free: '40 MB' })
  })

  it('draws the line exactly at the floor', () => {
    expect(diskVerdict(MIN_FREE_BYTES_TO_RECORD - 1).action).toBe('refuse')
    expect(diskVerdict(MIN_FREE_BYTES_TO_RECORD).action).toBe('warn')
  })

  it('still records, with a warning, when space is low but workable', () => {
    expect(diskVerdict(900 * MB)).toEqual({ action: 'warn', free: '900 MB' })
    expect(diskVerdict(1.5 * GB)).toEqual({ action: 'warn', free: '1.5 GB' })
  })

  it('records without comment once there is room', () => {
    expect(diskVerdict(2 * GB)).toEqual({ action: 'record' })
    expect(diskVerdict(500 * GB)).toEqual({ action: 'record' })
  })

  it('never blocks a recording because free space could not be read', () => {
    // A drive whose space cannot be measured is not a full drive. Refusing here
    // would stop people recording for no reason at all.
    expect(diskVerdict(null)).toEqual({ action: 'record' })
  })

  it('never shows a negative amount, even if the OS reports one', () => {
    expect(diskVerdict(-5 * MB)).toEqual({ action: 'refuse', free: '0 MB' })
  })
})

describe('freeBytes', () => {
  it('multiplies available blocks by block size, as the OS reports them', () => {
    expect(freeBytes('/r', () => ({ bavail: 1000, bsize: 4096 }))).toBe(4_096_000)
  })

  it('handles the bigint form statfs can return', () => {
    expect(freeBytes('/r', () => ({ bavail: 10n, bsize: 4096n }))).toBe(40_960)
  })

  it('reports unknown rather than throwing when statfs fails', () => {
    expect(freeBytes('/missing', () => { throw new Error('ENOENT') })).toBeNull()
  })
})

describe('lowDiskWarning keeps its old meaning', () => {
  it('gives no warning for a drive whose space cannot be read', () => {
    // statfs fails on a path that does not exist, so space is unknown - and
    // unknown must never put a warning in front of somebody who is recording.
    expect(lowDiskWarning('/definitely/not/a/real/path/for/screenpolish')).toBeNull()
  })
})
