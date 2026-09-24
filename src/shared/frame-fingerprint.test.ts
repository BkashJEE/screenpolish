import { describe, expect, it } from 'vitest'
import {
  FINGERPRINT_LENGTH,
  fingerprintFromPixels,
  fingerprintSimilarity,
  MIN_MATCH,
  MIN_MATCH_WITH_UNSEEN,
  pickByFingerprint
} from './frame-fingerprint'

/** A deterministic picture: a gradient plus a block whose place depends on `seed`. */
function picture(seed: number): number[] {
  const out: number[] = []
  for (let i = 0; i < FINGERPRINT_LENGTH; i++) {
    const x = i % 32
    const y = Math.floor(i / 32)
    const block = Math.abs(x - ((seed * 7) % 32)) < 5 && Math.abs(y - ((seed * 5) % 24)) < 4 ? 180 : 0
    out.push(((x * 3 + y * 5 * seed) % 60) + block)
  }
  return out
}

describe('fingerprintFromPixels', () => {
  it('reads luminance in either channel order', () => {
    const rgba = new Uint8Array(FINGERPRINT_LENGTH * 4)
    const bgra = new Uint8Array(FINGERPRINT_LENGTH * 4)
    rgba.set([255, 0, 0, 255], 0)
    bgra.set([0, 0, 255, 255], 0)
    expect(fingerprintFromPixels(rgba, 'rgba')![0]).toBeCloseTo(0.2126 * 255, 6)
    expect(fingerprintFromPixels(bgra, 'bgra')![0]).toBeCloseTo(0.2126 * 255, 6)
  })

  it('refuses a buffer that is not the fingerprint size', () => {
    expect(fingerprintFromPixels(new Uint8Array(12))).toBeNull()
  })
})

describe('fingerprintSimilarity', () => {
  it('is 1 for a picture and itself, and ignores brightness and contrast changes', () => {
    const a = picture(1)
    expect(fingerprintSimilarity(a, a)).toBeCloseTo(1, 6)
    expect(fingerprintSimilarity(a, a.map((v) => v * 0.7 + 30))).toBeCloseTo(1, 6)
  })

  it('scores a flat picture 0, since it says nothing', () => {
    expect(fingerprintSimilarity(picture(1), new Array(FINGERPRINT_LENGTH).fill(40))).toBe(0)
  })
})

describe('pickByFingerprint', () => {
  const stream = picture(1)
  const claude = { id: 'claude', fingerprint: picture(3) }
  const x = { id: 'x', fingerprint: stream.map((v, i) => v + ((i * 13) % 7)) }

  it('picks the window that shows what the stream shows', () => {
    expect(pickByFingerprint(stream, [claude, x])?.id).toBe('x')
    expect(pickByFingerprint(stream, [x, claude])?.id).toBe('x')
  })

  it('picks nothing when no window looks like the stream', () => {
    expect(pickByFingerprint(stream, [claude, { id: 'other', fingerprint: picture(5) }])).toBeNull()
  })

  it('picks nothing when two windows show the same thing', () => {
    expect(pickByFingerprint(stream, [x, { id: 'twin', fingerprint: [...x.fingerprint] }])).toBeNull()
  })

  it('needs a stream fingerprint', () => {
    expect(pickByFingerprint(null, [x])).toBeNull()
  })

  it('still picks a near-certain match when another candidate could not be captured', () => {
    expect(pickByFingerprint(stream, [{ id: 'unseen', fingerprint: null }, x])?.id).toBe('x')
  })

  it('refuses a merely good match when the stream might be the window it could not see', () => {
    // Same layout, different content: the kind of score a neighbouring app gets.
    const other = picture(3)
    const lookalike = { id: 'lookalike', fingerprint: stream.map((v, i) => v + 0.9 * other[i]) }
    const score = fingerprintSimilarity(stream, lookalike.fingerprint)
    expect(score).toBeGreaterThan(MIN_MATCH)
    expect(score).toBeLessThan(MIN_MATCH_WITH_UNSEEN)
    expect(pickByFingerprint(stream, [lookalike])?.id).toBe('lookalike')
    expect(pickByFingerprint(stream, [{ id: 'unseen', fingerprint: null }, lookalike])).toBeNull()
  })
})
