import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT } from '@shared/types'
import { mergeProject, serializeProject } from './project-io'

describe('mergeProject', () => {
  it('returns defaults for garbage', () => {
    expect(mergeProject(null)).toEqual(DEFAULT_PROJECT)
    expect(mergeProject('nope')).toEqual(DEFAULT_PROJECT)
    expect(mergeProject([])).toEqual(DEFAULT_PROJECT)
  })

  it('does not alias the defaults object', () => {
    const p = mergeProject({})
    p.zoom.manual.push({ id: 'x', start: 0, end: 1, x: 0, y: 0, scale: 2, source: 'manual' })
    expect(DEFAULT_PROJECT.zoom.manual).toHaveLength(0)
  })

  it('keeps user values and fills missing nested keys', () => {
    const p = mergeProject({ version: 1, frame: { padding: 0.2 }, output: { fps: 60 }, audio: { mic: false } })
    expect(p.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(p.frame).toEqual({ ...DEFAULT_PROJECT.frame, padding: 0.2 })
    expect(p.output).toEqual({ ...DEFAULT_PROJECT.output, fps: 60 })
    expect(p.audio).toEqual({ ...DEFAULT_PROJECT.audio, mic: false, system: true })
    expect(p.cursor).toEqual(DEFAULT_PROJECT.cursor)
  })

  it('normalizes legacy and malformed frame size', () => {
    expect(mergeProject({ frame: { padding: 0.1 } }).frame.size).toBe(1)
    expect(mergeProject({ frame: { size: 0.25 } }).frame.size).toBe(0.5)
    expect(mergeProject({ frame: { size: 2 } }).frame.size).toBe(1.5)
    expect(mergeProject({ frame: { size: Number.NaN } } as never).frame.size).toBe(1)
    expect(mergeProject({ frame: { size: 'large' } } as never).frame.size).toBe(1)
  })

  it('ignores sections of the wrong shape and pins version to 1', () => {
    const p = mergeProject({ version: 7, frame: 'wide', zoom: null })
    expect(p.version).toBe(1)
    expect(p.frame).toEqual(DEFAULT_PROJECT.frame)
    expect(p.zoom).toEqual(DEFAULT_PROJECT.zoom)
  })
})

describe('crop persistence', () => {
  it('normalizes legacy and malformed crops during load', () => {
    expect(mergeProject({}).crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
    expect(mergeProject({ crop: { x: 0.2, y: 0.1, width: 1, height: 1 } } as never).crop).toEqual({ x: 0.2, y: 0.1, width: 0.8, height: 0.9 })
    expect(mergeProject({ crop: { x: 0, y: 0, width: Number.NaN, height: 1 } } as never).crop).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  })
})

describe('serializeProject', () => {
  it('round-trips through JSON', () => {
    expect(JSON.parse(serializeProject(DEFAULT_PROJECT))).toEqual(DEFAULT_PROJECT)
  })
})

describe('click sounds saved by early window-tracking builds', () => {
  it('keep their setting through the real load path', () => {
    const onDisk = { version: 1, audio: { ...DEFAULT_PROJECT.audio, clickSounds: true } }
    expect(mergeProject(onDisk).cursor.clickSound?.enabled).toBe(true)
    expect(mergeProject({ version: 1, audio: { ...DEFAULT_PROJECT.audio, clickSounds: false } }).cursor.clickSound?.enabled).toBe(false)
  })

  it('never override a setting the project already has', () => {
    const onDisk = {
      version: 1,
      audio: { ...DEFAULT_PROJECT.audio, clickSounds: true },
      cursor: { ...DEFAULT_PROJECT.cursor, clickSound: { enabled: false, style: 'soft', volume: 0.6 } }
    }
    expect(mergeProject(onDisk).cursor.clickSound?.enabled).toBe(false)
  })
})
