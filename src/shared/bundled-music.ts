/**
 * The music that ships with the app.
 *
 * These were written for ScreenPolish by `scripts/lofi-tracks.py`: every sound
 * is computed, nothing is sampled, and no licence is owed to anyone. That is
 * what makes them safe to redistribute inside the application, where a track
 * from a "royalty free" library usually is not — most of those permit use but
 * forbid passing the file on.
 *
 * They are addressed the same way the bundled background is, so playback and
 * export need no special case: `bundled:` resolves to `polish://asset/` and the
 * asset protocol serves it out of `resources/`.
 */

export interface BundledTrack {
  /** Stored in the project, and resolved by imageUrlForPath. */
  path: string
  name: string
  /** What the track is for, shown beside its name. */
  note: string
  seconds: number
}

export const BUNDLED_MUSIC: BundledTrack[] = [
  { path: 'bundled:music/Desk Lamp.mp3', name: 'Desk Lamp', note: '72 bpm · soft kit', seconds: 106 },
  { path: 'bundled:music/Late Commit.mp3', name: 'Late Commit', note: '80 bpm · brighter', seconds: 96 },
  { path: 'bundled:music/Paper Cup.mp3', name: 'Paper Cup', note: '76 bpm · warm', seconds: 101 },
  { path: 'bundled:music/Night Shift.mp3', name: 'Night Shift', note: '68 bpm · minor', seconds: 112 },
  { path: 'bundled:music/Window Rain.mp3', name: 'Window Rain', note: '64 bpm · no drums', seconds: 120 },
  { path: 'bundled:music/Long Weekend.mp3', name: 'Long Weekend', note: '60 bpm · pad only', seconds: 128 }
]

/** The file each track is served from, relative to `resources/`. */
export function bundledMusicFile(track: BundledTrack): string {
  return track.path.replace(/^bundled:/, '')
}
