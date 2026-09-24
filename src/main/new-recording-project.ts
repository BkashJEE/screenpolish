// The project.json a freshly finished recording starts with.
//
// Separate from DEFAULT_PROJECT on purpose: DEFAULT_PROJECT also fills gaps in
// older saved projects, so turning something on there would change recordings
// that were already made. Choices here only apply to new takes.

import { DEFAULT_PROJECT, type Project } from '@shared/types'
import { DEFAULT_CLICK_SOUND } from '@shared/click-sound'
import { DEFAULT_ZOOM_SOUND } from '@shared/zoom-sound'

export function newRecordingProject(args: { title: string; fps: 30 | 60; cursorSkin: string }): Project {
  const skin = args.cursorSkin
  const style = skin === 'sprite' ? 'sprite' : skin === 'hand' ? 'hand' : skin === 'dot' || skin === 'ring' ? 'dot' : 'arrow'
  return {
    ...DEFAULT_PROJECT,
    title: args.title,
    output: { ...DEFAULT_PROJECT.output, fps: args.fps },
    // New recordings get a soft whoosh under each zoom; turn it off per project under Zoom.
    zoom: { ...DEFAULT_PROJECT.zoom, sound: { ...DEFAULT_ZOOM_SOUND, enabled: true } },
    // New recordings tick on every mouse press; turn it off per project under Cursor.
    cursor: { ...DEFAULT_PROJECT.cursor, style, clickSound: { ...DEFAULT_CLICK_SOUND, enabled: true } }
  }
}
