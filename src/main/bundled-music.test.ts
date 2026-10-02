import { describe, expect, it } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { BUNDLED_MUSIC, bundledMusicFile } from '@shared/bundled-music'

/** The shelf offers these before anyone has added music of their own, so a
 *  missing file would be a dead entry in a panel on first run. */
describe('the music that ships', () => {
  it('has the file each track claims', () => {
    for (const track of BUNDLED_MUSIC) {
      const file = join(__dirname, '../../resources', bundledMusicFile(track))
      expect(existsSync(file), `missing ${file}`).toBe(true)
    }
  })

  it('ships audio, not placeholders', () => {
    for (const track of BUNDLED_MUSIC) {
      const file = join(__dirname, '../../resources', bundledMusicFile(track))
      expect(statSync(file).size, `${track.name} is too small to be audio`).toBeGreaterThan(200_000)
    }
  })
})
