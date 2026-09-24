import { expect, it } from 'vitest'
import { editRegion } from './region-edit'
it('moves regions without changing duration or crossing recording bounds', () => {
  expect(editRegion({start:2,end:4}, -5, 'move', 10)).toEqual({start:0,end:2})
  expect(editRegion({start:2,end:4}, 12, 'move', 10)).toEqual({start:8,end:10})
})
it('keeps resized regions positive', () => {
  expect(editRegion({start:2,end:4}, 10, 'start', 10).start).toBeCloseTo(3.9)
  expect(editRegion({start:2,end:4}, -10, 'end', 10).end).toBeCloseTo(2.1)
})
