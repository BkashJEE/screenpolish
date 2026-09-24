import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { parseWhisperProgress, whisperArgs, whisperFiles, whisperMissing, whisperThreads } from './captions'

describe('whisperFiles', () => {
  it('uses the packaged resources in a built app and vendor/ in a checkout', () => {
    expect(whisperFiles({ isPackaged: true, resourcesPath: '/opt/ScreenPolish/resources', appPath: '/x', platform: 'linux' })).toEqual({
      bin: path.join('/opt/ScreenPolish/resources', 'whisper', 'whisper-cli'),
      model: path.join('/opt/ScreenPolish/resources', 'whisper', 'ggml-base.en.bin')
    })
    expect(whisperFiles({ isPackaged: false, resourcesPath: '/x', appPath: '/repo', platform: 'linux' }).bin).toBe(path.join('/repo', 'vendor', 'whisper', 'whisper-cli'))
    expect(whisperFiles({ isPackaged: true, resourcesPath: 'C:\\app', appPath: '/x', platform: 'win32' }).bin.endsWith('whisper-cli.exe')).toBe(true)
  })
})

describe('whisperMissing', () => {
  const files = { bin: '/w/whisper-cli', model: '/w/ggml-base.en.bin' }
  it('names the missing piece and how to get it', () => {
    expect(whisperMissing(files, () => false)).toMatch(/speech engine is missing.*fetch-whisper/)
    expect(whisperMissing(files, (p) => p === files.bin)).toMatch(/speech model is missing/)
    expect(whisperMissing(files, () => true)).toBeNull()
  })
})

describe('whisperArgs', () => {
  it('asks for English JSON, caption-length lines split on words, and progress', () => {
    const args = whisperArgs({ bin: 'b', model: 'm.bin' }, 'a.wav', '/tmp/out', 6)
    expect(args).toEqual(expect.arrayContaining(['-m', 'm.bin', '-f', 'a.wav', '-t', '6', '-l', 'en', '-oj', '-of', '/tmp/out', '-ml', '42', '-sow', '-pp', '-np']))
  })
})

describe('parseWhisperProgress', () => {
  it('reads the percentage from whisper-cli progress lines', () => {
    expect(parseWhisperProgress('whisper_print_progress_callback: progress =  45%')).toBe(45)
    expect(parseWhisperProgress('whisper_print_progress_callback: progress = 100%')).toBe(100)
    expect(parseWhisperProgress('whisper_init_from_file_with_params_no_state: loading model')).toBeNull()
  })
})

describe('whisperThreads', () => {
  it('leaves two cores free and stops at eight', () => {
    expect(whisperThreads(28)).toBe(8)
    expect(whisperThreads(6)).toBe(4)
    expect(whisperThreads(2)).toBe(1)
  })
})
