import { describe, expect, it } from 'vitest'
import { fileUri, uriList } from './file-uri'

describe('fileUri', () => {
  it('keeps the separators and encodes the segments', () => {
    expect(fileUri('/home/a/Videos/ScreenPolish/take/exports/clip.mp4'))
      .toBe('file:///home/a/Videos/ScreenPolish/take/exports/clip.mp4')
  })

  it('encodes a space, so one file stays one file', () => {
    expect(fileUri('/home/a/Team Standup.mp4')).toBe('file:///home/a/Team%20Standup.mp4')
  })

  it('encodes the characters a URI would otherwise swallow', () => {
    expect(fileUri('/home/a/take #2 (final).mp4')).toBe('file:///home/a/take%20%232%20(final).mp4')
    expect(fileUri('/home/a/100% done.gif')).toBe('file:///home/a/100%25%20done.gif')
  })
})

describe('uriList', () => {
  it('terminates every line with CRLF', () => {
    expect(uriList(['/a/b.mp4'])).toBe('file:///a/b.mp4\r\n')
  })
})
