import { describe, expect, it } from 'vitest'
import type { SourceInfo } from '../../shared/ipc'
import { describeScreenSize, describeSource, displayIdOf } from './sources'

const screens: SourceInfo[] = [
  { id: 'screen:2528732444:0', name: 'Screen 1', kind: 'screen', bounds: { x: 0, y: 0, width: 1707, height: 960 }, scaleFactor: 1.5 },
  { id: '77', name: 'Screen 2', kind: 'screen', bounds: { x: 1707, y: 0, width: 1920, height: 1080 } },
  { id: 'window:1234:0', name: 'Notepad', kind: 'window' }
]

describe('displayIdOf', () => {
  it('parses desktopCapturer ids and bare numbers', () => {
    expect(displayIdOf(screens[0])).toBe(2528732444)
    expect(displayIdOf(screens[1])).toBe(77)
    expect(displayIdOf({ id: 'screen:5', kind: 'screen' })).toBe(5)
  })
  it('falls back to 0 for anything else', () => {
    expect(displayIdOf(screens[2])).toBe(0)
  })
})

describe('describeSource', () => {
  it('names screens, regions and windows', () => {
    expect(describeSource(null, screens)).toBe('Choose a source')
    expect(describeSource({ kind: 'screen', displayId: 77 }, screens)).toBe('Screen 2')
    expect(describeSource({ kind: 'region', displayId: 2528732444 }, screens)).toBe('Region on Screen 1')
    expect(describeSource({ kind: 'window', sourceId: 'window:1234:0' }, screens)).toBe('Window: Notepad')
    expect(describeSource({ kind: 'window', sourceId: 'nope' }, screens)).toBe('Window')
    expect(describeSource({ kind: 'screen', displayId: 9 }, screens)).toBe('Display 9')
  })
})

describe('describeScreenSize', () => {
  it('uses physical pixels', () => {
    expect(describeScreenSize(screens[0])).toBe('2561 x 1440')
    expect(describeScreenSize(screens[1])).toBe('1920 x 1080')
    expect(describeScreenSize(screens[2])).toBe('')
  })
})
