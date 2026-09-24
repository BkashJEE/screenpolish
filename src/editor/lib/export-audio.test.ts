import { AudioSample } from 'mediabunny'
import { describe, expect, it } from 'vitest'
import { scaleAudioSample, retimeAudioSample } from './export'

describe('scaleAudioSample', () => {
  it('retimes stereo samples and preserves channel separation', () => {
    const input = new AudioSample({ data: new Float32Array([0, 1, 0.2, 0.8, 0.4, 0.6, 0.6, 0.4]), format: 'f32', numberOfChannels: 2, sampleRate: 48000, timestamp: 0 })
    const output = retimeAudioSample(input, 2, 3)
    expect(output.numberOfFrames).toBe(2)
    expect(output.timestamp).toBe(3)
    const data = new Float32Array(4)
    output.copyTo(data, { planeIndex: 0, format: 'f32' })
    expect(data[0]).toBe(0)
    expect(data[1]).toBe(1)
    expect(data[2]).toBeCloseTo(0.4)
    expect(data[3]).toBeCloseTo(0.6)
    input.close()
    output.close()
  })
  it('applies gain to every interleaved channel and keeps timing metadata', () => {
    const input = new AudioSample({
      data: new Float32Array([1, -1, 0.5, -0.5]),
      format: 'f32',
      numberOfChannels: 2,
      sampleRate: 48_000,
      timestamp: 1.25
    })
    const output = scaleAudioSample(input, 0.5)
    const data = new Float32Array(4)
    output.copyTo(data, { planeIndex: 0, format: 'f32' })
    expect(Array.from(data)).toEqual([0.5, -0.5, 0.25, -0.25])
    expect(output.numberOfChannels).toBe(2)
    expect(output.sampleRate).toBe(48_000)
    expect(output.timestamp).toBe(1.25)
    output.close()
    input.close()
  })

  it('clamps invalid gain and prevents sample overflow', () => {
    const input = new AudioSample({ data: new Float32Array([2, -2]), format: 'f32', numberOfChannels: 1, sampleRate: 48_000, timestamp: 0 })
    const output = scaleAudioSample(input, Number.NaN)
    const data = new Float32Array(2)
    output.copyTo(data, { planeIndex: 0, format: 'f32' })
    expect(Array.from(data)).toEqual([1, -1])
    output.close()
    input.close()
  })
})
