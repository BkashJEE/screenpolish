import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import {
  contentTypeFor,
  decodeFolderName,
  encodeFolderName,
  imageUrl,
  mediaUrl,
  parseRange,
  resolveImagePath,
  resolveMediaPath
} from './media-range'

describe('parseRange', () => {
  it('serves the full file without a header', () => {
    expect(parseRange(undefined, 100)).toEqual({ type: 'full' })
    expect(parseRange(null, 100)).toEqual({ type: 'full' })
    expect(parseRange('', 100)).toEqual({ type: 'full' })
  })

  it('parses closed ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ type: 'range', start: 0, end: 99 })
    expect(parseRange('bytes=10-20', 1000)).toEqual({ type: 'range', start: 10, end: 20 })
  })

  it('parses open-ended ranges', () => {
    expect(parseRange('bytes=500-', 1000)).toEqual({ type: 'range', start: 500, end: 999 })
  })

  it('parses suffix ranges', () => {
    expect(parseRange('bytes=-100', 1000)).toEqual({ type: 'range', start: 900, end: 999 })
    expect(parseRange('bytes=-5000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
    expect(parseRange('bytes=-0', 1000)).toEqual({ type: 'unsatisfiable' })
  })

  it('clamps an end past EOF', () => {
    expect(parseRange('bytes=0-5000', 1000)).toEqual({ type: 'range', start: 0, end: 999 })
  })

  it('rejects ranges that start past EOF or are inverted', () => {
    expect(parseRange('bytes=1000-', 1000)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=50-10', 1000)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=0-', 0)).toEqual({ type: 'unsatisfiable' })
  })

  it('falls back to full for malformed or multi-range headers', () => {
    expect(parseRange('bytes=-', 1000)).toEqual({ type: 'full' })
    expect(parseRange('bytes=0-10,20-30', 1000)).toEqual({ type: 'full' })
    expect(parseRange('items=0-10', 1000)).toEqual({ type: 'full' })
    expect(parseRange('garbage', 1000)).toEqual({ type: 'full' })
  })

  it('is case-insensitive and tolerates whitespace', () => {
    expect(parseRange('Bytes = 0 - 9', 100)).toEqual({ type: 'range', start: 0, end: 9 })
  })
})

describe('contentTypeFor', () => {
  it('maps known extensions', () => {
    expect(contentTypeFor('screen.mp4')).toBe('video/mp4')
    expect(contentTypeFor('events.JSON')).toBe('application/json')
    expect(contentTypeFor('thumb.jpg')).toBe('image/jpeg')
    expect(contentTypeFor('x.png')).toBe('image/png')
    expect(contentTypeFor('CourierPrime-Regular.woff2')).toBe('font/woff2')
    // The rail renders the app mark from resources; octet-stream would not paint.
    expect(contentTypeFor('icon.svg')).toBe('image/svg+xml')
  })
  it('defaults to octet-stream', () => {
    expect(contentTypeFor('weird.bin')).toBe('application/octet-stream')
  })
})

describe('folder encoding', () => {
  it('round-trips', () => {
    const name = '2026-09-01_23-15-07'
    expect(decodeFolderName(encodeFolderName(name))).toBe(name)
    expect(encodeFolderName(name)).not.toMatch(/[+/=]/)
  })
})

describe('mediaUrl / resolveMediaPath', () => {
  const root = path.resolve('C:/Users/x/Videos/Polish')
  const folder = path.join(root, '2026-09-01_23-15-07')

  it('builds a URL that resolves back to the same file', () => {
    const url = mediaUrl(folder, 'screen.mp4')
    expect(url.startsWith('polish://media/')).toBe(true)
    expect(resolveMediaPath(root, url)).toBe(path.join(folder, 'screen.mp4'))
  })

  it('supports one nested level for exports', () => {
    const url = mediaUrl(folder, 'exports/thumb.jpg')
    expect(resolveMediaPath(root, url)).toBe(path.join(folder, 'exports', 'thumb.jpg'))
  })

  it('rejects traversal, wrong hosts and foreign schemes', () => {
    const evilFolder = encodeFolderName('..')
    expect(resolveMediaPath(root, `polish://media/${evilFolder}/secret.txt`)).toBeNull()
    expect(resolveMediaPath(root, `polish://media/${encodeFolderName('a/../..')}/x`)).toBeNull()
    expect(resolveMediaPath(root, `polish://media/${encodeFolderName('2026')}/../x`)).toBeNull()
    expect(resolveMediaPath(root, `polish://media/${encodeFolderName('2026')}/%2e%2e/x`)).toBeNull()
    expect(resolveMediaPath(root, `polish://media/${encodeFolderName('2026')}`)).toBeNull()
    expect(resolveMediaPath(root, `polish://other/${encodeFolderName('2026')}/x`)).toBeNull()
    expect(resolveMediaPath(root, `http://media/${encodeFolderName('2026')}/x`)).toBeNull()
    expect(resolveMediaPath(root, 'not a url')).toBeNull()
  })

  it('rejects folder names carrying separators even when base64url-encoded', () => {
    expect(resolveMediaPath(root, `polish://media/${encodeFolderName('sub\\dir')}/x.mp4`)).toBeNull()
  })
})

describe('imageUrl / resolveImagePath', () => {
  it('round-trips an absolute path', () => {
    const p = path.resolve('C:/Users/x/Pictures/bg.png')
    expect(resolveImagePath(imageUrl(p))).toBe(p)
  })
  it('rejects other hosts', () => {
    expect(resolveImagePath('polish://media/abc/x')).toBeNull()
  })
})
