import { describe, expect, it } from 'vitest'
import { chooseCaptureEncoder, type CaptureEncoderChoice } from './encoder-choice'

const key = (c: CaptureEncoderChoice) => `${c.codec}/${c.hardwareAcceleration}`

describe('chooseCaptureEncoder', () => {
  it('uses hardware H.264 when the GPU can open it', async () => {
    expect(await chooseCaptureEncoder(async () => true)).toEqual({ codec: 'avc', hardwareAcceleration: 'prefer-hardware' })
  })

  it('falls back to software H.264 when no hardware encoder exists', async () => {
    const supported = new Set(['avc/no-preference', 'vp9/no-preference'])
    expect(await chooseCaptureEncoder(async (c) => supported.has(key(c)))).toEqual({ codec: 'avc', hardwareAcceleration: 'no-preference' })
  })

  it('treats a throwing probe as unsupported and reports none when nothing opens', async () => {
    expect(await chooseCaptureEncoder(async () => { throw new Error('boom') })).toBeNull()
  })
})
