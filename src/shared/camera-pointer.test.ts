import { expect, it } from 'vitest'
import { cameraPointerAt, smoothedPointerAt, type PointerSample } from './pointer'

it('attenuates fast hand tremor without changing the displayed cursor path', () => {
  const path: PointerSample[] = Array.from({length:241},(_,i)=>[i*1000/120,500+20*Math.sin(2*Math.PI*12*i/120),300])
  let cameraEnergy=0, cursorEnergy=0
  for(let t=0.3;t<1.7;t+=1/60){
    cameraEnergy+=(cameraPointerAt(path,t)!.x-500)**2
    cursorEnergy+=(smoothedPointerAt(path,t)!.x-500)**2
  }
  expect(cameraEnergy).toBeLessThan(cursorEnergy*0.02)
})
it('preserves steady pans with no phase delay and is independent of seek order', () => {
  const path: PointerSample[]=[[0,0,0],[2000,200,100]]
  expect(cameraPointerAt(path,1)!.x).toBeCloseTo(100)
  const before=cameraPointerAt(path,0.7)
  cameraPointerAt(path,1.8)
  expect(cameraPointerAt(path,0.7)).toEqual(before)
  expect(cameraPointerAt([],1)).toBeNull()
})
