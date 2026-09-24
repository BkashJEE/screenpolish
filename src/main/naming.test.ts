import { describe, expect, it } from 'vitest'
import { formatFolderName, isRecordingFolderName, parseFolderName, sanitizeBaseName, stemOf, uniqueName } from './naming'

describe('formatFolderName / parseFolderName', () => {
  it('formats local time with zero padding', () => {
    expect(formatFolderName(new Date(2026, 8, 1, 3, 7, 9))).toBe('2026-09-01_03-07-09')
  })
  it('round-trips', () => {
    const d = new Date(2026, 11, 31, 23, 59, 58)
    expect(parseFolderName(formatFolderName(d))).toBe(d.getTime())
  })
  it('rejects names that do not match or are impossible dates', () => {
    expect(parseFolderName('screen.mp4')).toBeNull()
    expect(parseFolderName('2026-13-01_00-00-00')).toBeNull()
    expect(parseFolderName('2026-02-30_00-00-00')).toBeNull()
    expect(isRecordingFolderName('2026-09-01_03-07-09')).toBe(true)
    expect(isRecordingFolderName('exports')).toBe(false)
  })
  it('sorts lexicographically by time', () => {
    const a = formatFolderName(new Date(2026, 0, 1, 0, 0, 0))
    const b = formatFolderName(new Date(2026, 0, 1, 0, 0, 1))
    expect(a < b).toBe(true)
  })
})

describe('sanitizeBaseName', () => {
  it('replaces illegal characters and trims trailing dots', () => {
    expect(sanitizeBaseName('demo: v1/final?')).toBe('demo- v1-final-')
    expect(sanitizeBaseName('  clip...  ')).toBe('clip')
  })
  it('never returns empty', () => {
    expect(sanitizeBaseName('')).toBe('export')
    expect(sanitizeBaseName('...')).toBe('export')
  })
})

describe('uniqueName', () => {
  it('returns base.ext when free', () => {
    expect(uniqueName([], 'demo', 'mp4')).toBe('demo.mp4')
  })
  it('appends (n) until free, case-insensitively', () => {
    expect(uniqueName(['Demo.mp4'], 'demo', 'mp4')).toBe('demo (2).mp4')
    expect(uniqueName(['demo.mp4', 'demo (2).mp4'], 'demo', 'mp4')).toBe('demo (3).mp4')
    expect(uniqueName(['demo.mp4', 'demo (3).mp4'], 'demo', 'mp4')).toBe('demo (2).mp4')
  })
  it('does not collide across extensions', () => {
    expect(uniqueName(['demo.mp4'], 'demo', 'gif')).toBe('demo.gif')
  })
})

describe('stemOf', () => {
  it('drops the last extension only', () => {
    expect(stemOf('demo (2).gif')).toBe('demo (2)')
    expect(stemOf('archive.tar.gz')).toBe('archive.tar')
    expect(stemOf('noext')).toBe('noext')
  })
})
