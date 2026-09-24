import { expect, it } from 'vitest'
import { captureFrameRate } from './frame-timing'

it('preserves the recording clock when a static portal stops delivering frames', () => {
  expect(captureFrameRate(60)).toBe(60)
})
it('respects the selected recording rate', () => {
  expect(captureFrameRate(30)).toBe(30)
})
