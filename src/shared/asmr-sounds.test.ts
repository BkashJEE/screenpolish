import { describe, expect, it } from 'vitest'
import { clickSound } from './click-sound'
import { zoomSound, zoomSoundRuns } from './zoom-sound'

const peak = (s: Float32Array) => s.reduce((p, v) => Math.max(p, Math.abs(v)), 0)
const roughness = (s: Float32Array) => {
  let energy = 0, delta = 0
  for (let i = 1; i < s.length; i++) { energy += s[i] ** 2; delta += (s[i] - s[i - 1]) ** 2 }
  return delta / energy
}

describe('Soft / ASMR sounds', () => {
  for (const rate of [44100, 48000]) {
    it(`makes quieter, smoother taps at ${rate} Hz`, () => {
      const soft = clickSound('asmr', rate)
      expect(peak(soft)).toBeCloseTo(0.28)
      expect(roughness(soft)).toBeLessThan(roughness(clickSound('soft', rate)))
      expect(soft[0]).toBe(0)
      expect(soft.at(-1)).toBe(0)
      expect(clickSound('asmr', rate)).toEqual(soft)
    })
    for (const move of ['in', 'out', 'pan'] as const) {
      it(`makes a shorter, lower, quiet ${move} whoosh at ${rate} Hz`, () => {
        const soft = zoomSound(move, 0.6, rate, 'asmr')
        const original = zoomSound(move, 0.6, rate)
        expect(soft.length).toBeLessThan(original.length)
        expect(peak(soft)).toBeLessThan(0.181)
        expect(roughness(soft)).toBeLessThan(roughness(original))
        expect(Math.abs(soft[0])).toBeLessThan(0.0001)
        expect(Math.abs(soft.at(-1)!)).toBeLessThan(0.0001)
        const run = zoomSoundRuns([{ t: 1, move }], 0.6, { enabled: true, volume: 0.25, style: 'asmr' }, rate)[0]
        for (let i = 0; i < soft.length; i++) expect(run.samples[i]).toBeCloseTo(soft[i] * 0.25, 6)
      })
    }
  }
})
