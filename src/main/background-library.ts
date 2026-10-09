import * as fs from 'node:fs'
import * as path from 'node:path'

/** What the background picker will show from your folder. */
export const BACKGROUND_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

/** Enough for a real collection; a folder of holiday photos should not flood the panel. */
export const MAX_FOLDER_BACKGROUNDS = 60

export function isBackgroundFile(name: string): boolean {
  if (name.startsWith('.')) return false
  return (BACKGROUND_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase())
}

export interface FolderBackground {
  path: string
  name: string
}

/**
 * The pictures in your backgrounds folder, by name.
 *
 * The same idea as the music shelf: one flat folder, read each time, so what
 * you drop in is what you see. Sub-folders are not walked.
 */
export function listBackgrounds(dir: string): FolderBackground[] {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && isBackgroundFile(e.name))
    .map((e) => ({ path: path.join(dir, e.name), name: path.basename(e.name, path.extname(e.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, MAX_FOLDER_BACKGROUNDS)
}

export const BACKGROUNDS_README = `Backgrounds for your recordings
==============================

Put pictures in this folder and they appear under "Your folder" in
ScreenPolish's Background panel. ${BACKGROUND_EXTENSIONS.join(', ')} all work;
16:9 at 1600 x 900 or larger looks best.

Nothing here is uploaded: this is a folder on your machine that the app reads.
`

/** Create the folder if it is not there, and leave a note in it explaining itself. */
export function ensureBackgroundsFolder(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const readme = path.join(dir, 'README.txt')
  if (!fs.existsSync(readme)) {
    try {
      fs.writeFileSync(readme, BACKGROUNDS_README)
    } catch {
      // A read-only folder still lists fine; the note is a courtesy.
    }
  }
  return dir
}
