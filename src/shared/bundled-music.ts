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
  { path: 'bundled:music/Long Weekend.mp3', name: 'Long Weekend', note: '60 bpm · pad only', seconds: 128 },
  // Longer beds. The six above run a minute and a half to two minutes, which a
  // demo outlasts easily; these carry one on their own.
  { path: 'bundled:music/Second Coffee.mp3', name: 'Second Coffee', note: '70 bpm · 3 min', seconds: 193 },
  { path: 'bundled:music/Open Tabs.mp3', name: 'Open Tabs', note: '82 bpm · brighter, 3 min', seconds: 165 },
  { path: 'bundled:music/Deep Work.mp3', name: 'Deep Work', note: '64 bpm · no drums, 3½ min', seconds: 211 },
  { path: 'bundled:music/Blue Hour.mp3', name: 'Blue Hour', note: '68 bpm · minor, 3 min', seconds: 170 },
  { path: 'bundled:music/Low Light.mp3', name: 'Low Light', note: '74 bpm · warm, 2½ min', seconds: 157 },
  { path: 'bundled:music/Quiet Floor.mp3', name: 'Quiet Floor', note: '58 bpm · pad only, 3⅓ min', seconds: 200 }
]

/** The file each track is served from, relative to `resources/`. */
export function bundledMusicFile(track: BundledTrack): string {
  return track.path.replace(/^bundled:/, '')
}
