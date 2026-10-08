import { describe, expect, it } from 'vitest'
import { audioMixFilter, tempoFilters } from './audio-filter'
it('keeps each tempo stage in the supported range',()=>{
  expect(tempoFilters(0.25)).toBe('atempo=0.5,atempo=0.5')
  expect(tempoFilters(4)).toBe('atempo=2,atempo=2')
})
it('restores pitch and preserves each output span duration',()=>{
  const filter=audioMixFilter(2,[{start:0,end:3,rate:2},{start:3,end:9,rate:1}])
  expect(filter).toContain('asetrate=24000')
  expect(filter).toContain('atrim=duration=3')
  expect(filter).toContain('concat=n=2')
})
it('rejects invalid renderer-provided timelines',()=>{
  expect(()=>audioMixFilter(1,[{start:1,end:2,rate:2}])).toThrow()
  expect(()=>tempoFilters(Infinity)).toThrow()
})

describe('audio length', () => {
  it('pads the mix to the full video, so an outro card is not silent-and-shorter', () => {
    expect(audioMixFilter(1, undefined, 8.133)).toContain('apad,atrim=duration=8.133,alimiter')
    expect(audioMixFilter(1, [{ start: 0, end: 8, rate: 1 }], 8)).toContain('atrim=duration=8')
  })
  it('leaves the length alone when none is given', () => {
    expect(audioMixFilter(1)).not.toContain('atrim')
  })
  it('rejects a nonsense length', () => {
    for (const d of [0, -1, NaN, Infinity, 90000]) expect(() => audioMixFilter(1, undefined, d)).toThrow()
  })
})
