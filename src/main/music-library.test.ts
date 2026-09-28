import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureShelf, isMusicFile, listTracks, trackName } from './music-library'

function shelf(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sp-music-'))
  for (const f of files) writeFileSync(join(dir, f), 'x')
  return dir
}

describe('isMusicFile', () => {
  it('takes the formats the editor can load, whatever the case', () => {
    expect(isMusicFile('rain.mp3')).toBe(true)
    expect(isMusicFile('Rain.FLAC')).toBe(true)
    expect(isMusicFile('loop.opus')).toBe(true)
  })

  it('leaves everything else alone', () => {
    expect(isMusicFile('cover.jpg')).toBe(false)
    expect(isMusicFile('README.txt')).toBe(false)
    expect(isMusicFile('notes')).toBe(false)
  })

  it('skips dotfiles, including a half-written download', () => {
    expect(isMusicFile('.rain.mp3.part')).toBe(false)
    expect(isMusicFile('.DS_Store')).toBe(false)
  })
})

describe('trackName', () => {
  it('is the file name without its extension', () => {
    expect(trackName('/music/Rainy Window.mp3')).toBe('Rainy Window')
  })
})

describe('listTracks', () => {
  it('lists only audio, by name, counting numbers as numbers', () => {
    const dir = shelf(['take 10.mp3', 'take 2.mp3', 'cover.png', 'README.txt'])
    expect(listTracks(dir).map((t) => t.name)).toEqual(['take 2', 'take 10'])
  })

  it('ignores sub-folders rather than walking into them', () => {
    const dir = shelf(['one.mp3'])
    mkdirSync(join(dir, 'a sample pack'))
    writeFileSync(join(dir, 'a sample pack', 'two.mp3'), 'x')
    expect(listTracks(dir).map((t) => t.name)).toEqual(['one'])
  })

  it('is empty, not an error, when the folder is not there', () => {
    expect(listTracks(join(tmpdir(), 'sp-music-does-not-exist'))).toEqual([])
  })

  it('carries the size, so the panel can say how big a track is', () => {
    const dir = shelf(['one.mp3'])
    expect(listTracks(dir)[0].bytes).toBe(1)
  })
})

describe('ensureShelf', () => {
  it('creates the folder and explains itself once', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sp-shelf-')), 'Music')
    ensureShelf(dir)
    const readme = join(dir, 'README.txt')
    expect(existsSync(readme)).toBe(true)
    writeFileSync(readme, 'my own notes')
    ensureShelf(dir)
    expect(readFileSync(readme, 'utf8')).toBe('my own notes')
  })
})
