import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_FOLDER_BACKGROUNDS, ensureBackgroundsFolder, isBackgroundFile, listBackgrounds } from './background-library'

function folder(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'sp-bg-'))
  for (const f of files) writeFileSync(join(dir, f), 'x')
  return dir
}

describe('isBackgroundFile', () => {
  it('takes the pictures the renderer can draw, whatever the case', () => {
    for (const name of ['sky.png', 'Sky.JPG', 'a.jpeg', 'b.webp']) expect(isBackgroundFile(name)).toBe(true)
  })

  it('leaves everything else alone, dotfiles included', () => {
    for (const name of ['README.txt', 'clip.mp4', 'icon.svg', '.hidden.png', 'notes']) expect(isBackgroundFile(name)).toBe(false)
  })
})

describe('listBackgrounds', () => {
  it('lists pictures by name, without the extension, in natural order', () => {
    const dir = folder(['Wave 10.png', 'Wave 2.jpg', 'README.txt', 'alpha.webp'])
    mkdirSync(join(dir, 'nested.png'))
    expect(listBackgrounds(dir)).toEqual([
      { path: join(dir, 'alpha.webp'), name: 'alpha' },
      { path: join(dir, 'Wave 2.jpg'), name: 'Wave 2' },
      { path: join(dir, 'Wave 10.png'), name: 'Wave 10' }
    ])
  })

  it('is empty for a folder that is not there, and stops at a sensible count', () => {
    expect(listBackgrounds(join(tmpdir(), 'sp-bg-missing-' + Date.now()))).toEqual([])
    const many = folder(Array.from({ length: MAX_FOLDER_BACKGROUNDS + 5 }, (_, i) => `p${i}.png`))
    expect(listBackgrounds(many)).toHaveLength(MAX_FOLDER_BACKGROUNDS)
  })
})

describe('ensureBackgroundsFolder', () => {
  it('creates the folder with a note, and leaves an edited note alone', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sp-bg-')), 'ScreenPolish')
    ensureBackgroundsFolder(dir)
    expect(readFileSync(join(dir, 'README.txt'), 'utf8')).toContain('Background panel')
    writeFileSync(join(dir, 'README.txt'), 'mine')
    ensureBackgroundsFolder(dir)
    expect(readFileSync(join(dir, 'README.txt'), 'utf8')).toBe('mine')
    expect(existsSync(dir)).toBe(true)
  })
})
