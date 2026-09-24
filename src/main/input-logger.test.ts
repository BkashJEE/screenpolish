import { describe, expect, it } from 'vitest'
import { InputLogger } from './input-logger'

describe('an input log that could not be filled', () => {
  it('records why, so the editor can explain a take with no clicks', () => {
    const logger = new InputLogger()
    const region = { x: 0, y: 0, width: 3440, height: 1440, scale: 1.25 }
    logger.start(region, 1000, { input: false, inputNote: 'The share dialog handed over something ScreenPolish could not place.' })
    const events = logger.stop()
    expect(events?.clicks).toEqual([])
    expect(events?.pointer).toEqual([])
    expect(events?.inputNote).toBe('The share dialog handed over something ScreenPolish could not place.')
  })

  it('falls back to a plain reason rather than leaving the take unexplained', () => {
    const logger = new InputLogger()
    logger.start({ x: 0, y: 0, width: 100, height: 100, scale: 1 }, 1000, { input: false })
    expect(logger.stop()?.inputNote).toMatch(/were not recorded/)
  })

  it('says nothing when the log is complete', () => {
    const logger = new InputLogger()
    logger.start({ x: 0, y: 0, width: 100, height: 100, scale: 1 }, 1000, { input: false })
    logger.stop()
    const good = new InputLogger()
    good.start({ x: 0, y: 0, width: 100, height: 100, scale: 1 }, 1000, {})
    expect(good.stop()?.inputNote).toBeUndefined()
    good.stop()
  })
})
