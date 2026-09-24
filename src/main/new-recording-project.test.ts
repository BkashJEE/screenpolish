import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT } from '@shared/types'
import { newRecordingProject } from './new-recording-project'
import { mergeProject } from './project-io'

describe('new recording project', () => {
  it('turns click sounds on for new recordings and keeps the recorded fps and cursor skin', () => {
    const p = newRecordingProject({ title: 'Demo', fps: 60, cursorSkin: 'hand' })
    expect(p.cursor.clickSound).toEqual({ enabled: true, style: 'asmr', volume: 0.3 })
    expect(p.zoom.sound).toEqual({ enabled: true, volume: 0.25, style: 'asmr' })
    expect(p.cursor.style).toBe('hand')
    expect(p.output.fps).toBe(60)
    expect(p.title).toBe('Demo')
  })

  it('keeps click sounds on after the editor loads the saved file', () => {
    const saved = JSON.parse(JSON.stringify(newRecordingProject({ title: '', fps: 30, cursorSkin: 'arrow' })))
    expect(mergeProject(saved).cursor.clickSound?.enabled).toBe(true)
    expect(mergeProject(saved).zoom.sound?.enabled).toBe(true)
  })

  it('leaves older recordings without a click-sound setting unchanged (off)', () => {
    const { clickSound: _omit, ...oldCursor } = DEFAULT_PROJECT.cursor
    expect(mergeProject({ version: 1, cursor: oldCursor }).cursor.clickSound?.enabled).toBe(false)
    const { sound: _noSound, ...oldZoom } = DEFAULT_PROJECT.zoom
    expect(mergeProject({ version: 1, zoom: oldZoom }).zoom.sound?.enabled).toBe(false)
  })
})
