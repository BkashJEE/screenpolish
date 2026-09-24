import { describe, expect, it } from 'vitest'
import { HUE_STEP, HUE_STEP_COARSE, RECENT_COLOURS_MAX, SV_STEP, rememberColour, stepHue, stepSv } from './color-controls'

const hsv = { h: 200, s: 0.5, v: 0.5 }

describe('stepSv', () => {
  it('moves saturation and brightness by one step, ten with Shift', () => {
    expect(stepSv(hsv, 'ArrowRight')!.s).toBeCloseTo(0.5 + SV_STEP)
    expect(stepSv(hsv, 'ArrowLeft')!.s).toBeCloseTo(0.5 - SV_STEP)
    expect(stepSv(hsv, 'ArrowUp')!.v).toBeCloseTo(0.5 + SV_STEP)
    expect(stepSv(hsv, 'ArrowDown', true)!.v).toBeCloseTo(0.4)
  })

  it('clamps at the edges and jumps to white or the pure hue', () => {
    expect(stepSv({ h: 0, s: 0, v: 1 }, 'ArrowLeft')).toEqual({ h: 0, s: 0, v: 1 })
    expect(stepSv(hsv, 'Home')).toEqual({ h: 200, s: 0, v: 1 })
    expect(stepSv(hsv, 'End')).toEqual({ h: 200, s: 1, v: 1 })
  })

  it('ignores keys it does not handle, so typing still reaches the page', () => {
    for (const key of ['a', 'Enter', 'Tab', 'Escape', ' ']) expect(stepSv(hsv, key)).toBeNull()
  })
})

describe('stepHue', () => {
  it('steps by degrees and wraps past both ends', () => {
    expect(stepHue(200, 'ArrowRight')).toBe(200 + HUE_STEP)
    expect(stepHue(200, 'ArrowUp', true)).toBe(200 + HUE_STEP_COARSE)
    expect(stepHue(0, 'ArrowLeft')).toBe(359)
    expect(stepHue(359.5, 'ArrowRight')).toBeCloseTo(0.5)
  })

  it('ignores other keys', () => {
    expect(stepHue(200, 'x')).toBeNull()
  })
})

describe('rememberColour', () => {
  it('puts the newest first without duplicates', () => {
    expect(rememberColour(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
  })

  it('normalises and caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16)}${i.toString(16)}`)
    const list = rememberColour(many, '#ABC')
    expect(list[0]).toBe('#aabbcc')
    expect(list).toHaveLength(RECENT_COLOURS_MAX)
  })

  it('drops junk from a damaged stored list', () => {
    expect(rememberColour(['not a colour', '#123456'], 'rubbish')).toEqual(['#123456'])
  })
})
