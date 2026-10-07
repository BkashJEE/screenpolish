import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { keptTake } from './recording-session'

const sizes = (files: Record<string, number>) => (file: string) => files[path.basename(file)] ?? 0

describe('keptTake', () => {
  it('is an mp4 take once the remux has produced one', () => {
    expect(keptTake('/r/t', sizes({ 'screen.mp4': 10, 'screen.mkv': 10 }))).toBe('mp4')
    expect(keptTake('/r/t', sizes({ 'screen.mp4': 10 }))).toBe('mp4')
  })

  it('keeps a folder whose only video is screen.mkv', () => {
    expect(keptTake('/r/t', sizes({ 'screen.mkv': 18_727_188 }))).toBe('mkv')
    expect(keptTake('/r/t', sizes({ 'screen.mp4': 0, 'screen.mkv': 1 }))).toBe('mkv')
  })

  it('lets a folder with no video at all go', () => {
    expect(keptTake('/r/t', sizes({}))).toBeNull()
    expect(keptTake('/r/t', sizes({ 'screen.mp4': 0, 'screen.mkv': 0, 'mic.mp4': 500 }))).toBeNull()
  })

  it('reads the real folder by default', () => {
    expect(keptTake('/definitely/not/here')).toBeNull()
  })
})
