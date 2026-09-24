import { describe, expect, it } from 'vitest'
import { thumbnailArgs } from './thumbnail'

describe('thumbnailArgs', () => {
  it('seeks before the input and writes a single scaled jpeg', () => {
    const args = thumbnailArgs('C:\r\screen.mp4', 'C:\r\exports\thumb.jpg')
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'))
    expect(args).toContain('-frames:v')
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=640:-2')
    expect(args[args.length - 1]).toBe('C:\r\exports\thumb.jpg')
  })
})
