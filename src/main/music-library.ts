import * as fs from 'node:fs'
import * as path from 'node:path'

/** What the editor will accept as a music or voiceover track. */
export const MUSIC_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg', '.flac', '.opus'] as const

export function isMusicFile(name: string): boolean {
  if (name.startsWith('.')) return false
  return (MUSIC_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase())
}

/** A track's display name: the file name, without the extension. */
export function trackName(file: string): string {
  return path.basename(file, path.extname(file))
}

export interface Track {
  path: string
  name: string
  bytes: number
}

/**
 * The tracks on the shelf, by name.
 *
 * One flat folder, no library database: what you drop in is what you see, and
 * removing a file removes the track. Sub-folders are ignored rather than
 * walked, so a big sample pack dropped in by accident cannot take a minute to
 * list.
 */
export function listTracks(dir: string): Track[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && isMusicFile(e.name))
    .map((e) => {
      const full = path.join(dir, e.name)
      let bytes = 0
      try {
        bytes = fs.statSync(full).size
      } catch {
        bytes = 0
      }
      return { path: full, name: trackName(e.name), bytes }
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}

/** What the folder says about itself, so an empty shelf is not a dead end. */
export const SHELF_README = `Music for your recordings
=========================

Drop audio files in this folder and they appear in ScreenPolish's Audio panel,
ready to lay under a take. ${MUSIC_EXTENSIONS.join(', ')} all work.

Nothing here is uploaded, and nothing is downloaded for you: this is a folder
on your machine that the app reads.

Where to find music you are allowed to use
------------------------------------------

Check the licence of anything you publish a recording with. These sources are
common starting points for lo-fi and ambient:

  Free Music Archive   https://freemusicarchive.org   filter by CC0 or CC BY
  ccMixter             https://ccmixter.org           filter by CC0
  Wikimedia Commons    https://commons.wikimedia.org  public domain audio

CC0 asks nothing of you. CC BY asks for credit, which for a screen recording
usually means a line in the description of wherever you post it.

Several popular "royalty free" sites let you *use* their music but not pass the
files on, which matters if you share a project folder with someone else.
`

/** Create the shelf if it is not there, and leave a note in it explaining itself. */
export function ensureShelf(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const readme = path.join(dir, 'README.txt')
  if (!fs.existsSync(readme)) {
    try {
      fs.writeFileSync(readme, SHELF_README)
    } catch {
      // A read-only folder still lists fine; the note is a courtesy.
    }
  }
  return dir
}
