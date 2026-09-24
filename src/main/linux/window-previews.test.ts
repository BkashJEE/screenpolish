import { describe, expect, it } from 'vitest'
import { isStableId, previewArgs, previewScale, windowDetail, windowPreview, type PreviewClient } from './window-previews'

const client = (over: Partial<PreviewClient> = {}): PreviewClient => ({ stableId: '18000012', size: [1350, 1031], class: 'chromium', workspace: { id: 4, name: '4' }, ...over })

describe('window previews', () => {
  it('scales a window down to preview width, never up', () => {
    expect(previewScale(1280)).toBe(0.25)
    expect(previewScale(200)).toBe(1)
    expect(previewScale(0)).toBe(0.25)
  })

  it('only passes a real Hyprland stableId to grim', () => {
    expect(previewArgs(client())).toEqual(['-T', '18000012', '-s', '0.237', '-t', 'jpeg', '-q', '70', '-'])
    expect(isStableId('18000012; rm -rf ~')).toBe(false)
    expect(previewArgs(client({ stableId: '--help' }))).toBeNull()
    expect(previewArgs(client({ stableId: undefined }))).toBeNull()
  })

  it('names the app and workspace, including web apps and the scratchpad', () => {
    expect(windowDetail(client())).toBe('Chromium · Workspace 4')
    expect(windowDetail(client({ class: 'chrome-x.com__-Profile_1' }))).toBe('X.com · Workspace 4')
    expect(windowDetail(client({ class: 'com.anthropic.Claude', workspace: { id: 1, name: '1' } }))).toBe('Claude · Workspace 1')
    expect(windowDetail(client({ class: '', workspace: { id: -98, name: 'special:magic' } }))).toBe('Scratchpad')
  })

  it('returns a JPEG data URL, and nothing when grim fails or prints an error', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])
    expect(await windowPreview(client(), async () => jpeg)).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
    expect(await windowPreview(client(), async () => Buffer.from('cannot find toplevel'))).toBeUndefined()
    expect(await windowPreview(client(), async () => { throw new Error('ENOENT') })).toBeUndefined()
  })
})
