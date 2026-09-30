import { describe, expect, it } from 'vitest'
import { BUNDLED_MUSIC } from './bundled-music'

describe('bundled music', () => {
  it('ships at least one track with drums and one without', () => {
    expect(BUNDLED_MUSIC.some((t) => /no drums|pad only/.test(t.note))).toBe(true)
    expect(BUNDLED_MUSIC.some((t) => /kit/.test(t.note))).toBe(true)
  })

  it('addresses every track the way the bundled background is addressed', () => {
    for (const track of BUNDLED_MUSIC) expect(track.path.startsWith('bundled:music/')).toBe(true)
  })

  it('names each track once', () => {
    expect(new Set(BUNDLED_MUSIC.map((t) => t.name)).size).toBe(BUNDLED_MUSIC.length)
  })

  it('gives a length, so the panel can say how long a track runs', () => {
    for (const track of BUNDLED_MUSIC) expect(track.seconds).toBeGreaterThan(30)
  })
})
