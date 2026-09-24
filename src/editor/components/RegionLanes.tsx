import { useEffect, useRef } from 'react'
import type { Project } from '../../shared/types'
import { editRegion } from '../../shared/region-edit'

type Region = { id: string; start: number; end: number; label: string; kind: 'speed' | 'audio' }
type Mode = 'move' | 'start' | 'end'
export function RegionLanes({ project, duration, onProject, beginBatch, endBatch }: {
  project: Project; duration: number; onProject: (update: (project: Project) => Project) => void; beginBatch: () => void; endBatch: () => void
}) {
  const drag = useRef<{region:Region;mode:Mode;x:number;width:number} | null>(null)
  const applyDrag = useRef<(region:Region,delta:number,mode:Mode)=>void>(()=>undefined)
  const finishBatch = useRef(endBatch)
  finishBatch.current=endBatch
  const sourceDuration=useRef(duration)
  sourceDuration.current=duration
  useEffect(()=>{
    const move=(event: globalThis.PointerEvent)=>{
      const active=drag.current
      if(active)applyDrag.current(active.region,(event.clientX-active.x)/active.width*sourceDuration.current,active.mode)
    }
    const finish=()=>{if(drag.current){drag.current=null;finishBatch.current()}}
    window.addEventListener('pointermove',move)
    window.addEventListener('pointerup',finish)
    window.addEventListener('pointercancel',finish)
    window.addEventListener('blur',finish)
    return ()=>{
      window.removeEventListener('pointermove',move)
      window.removeEventListener('pointerup',finish)
      window.removeEventListener('pointercancel',finish)
      window.removeEventListener('blur',finish)
      finish()
    }
  },[])
  if (!(duration > 0)) return null
  const regions: Region[] = [
    ...(project.speedRegions ?? []).map(region => ({...region,label:`Speed ${region.rate}×`,kind:'speed' as const})),
    ...(project.audioRegions ?? []).map(region => ({...region,label:`Audio: ${region.path.split(/[\\/]/).at(-1)}`,kind:'audio' as const}))
  ]
  const patch = (region: Region, delta: number, mode: Mode) => {
    const times = editRegion(region,delta,mode,duration)
    onProject(project => region.kind === 'speed'
      ? {...project,speedRegions:project.speedRegions?.map(r=>r.id===region.id?{...r,...times}:r)}
      : {...project,audioRegions:project.audioRegions?.map(r=>r.id===region.id?{...r,...times}:r)})
  }
  const finish = () => { if(drag.current) {drag.current=null;endBatch()} }
  applyDrag.current=patch
  return <div className="mt-2 max-h-32 overflow-y-auto" aria-label="Speed and audio timeline lanes">
    {regions.map(region=><div key={`${region.kind}-${region.id}`} className="relative mb-1 h-6 rounded bg-bg-2">
      <div className="absolute flex h-6 min-w-[18px] rounded border border-accent/40 bg-accent-soft text-[10px]" style={{left:`${region.start/duration*100}%`,width:`${(region.end-region.start)/duration*100}%`}}>
        {(['start','move','end'] as Mode[]).map(mode=><button key={mode} type="button" aria-label={`${region.label}: ${mode}`}
          title={`${mode}: ${region.start.toFixed(2)}–${region.end.toFixed(2)}s. Arrow keys adjust; Shift for 1s.`}
          className={mode==='move'?'min-w-0 flex-1 cursor-grab truncate px-1':'w-2 shrink-0 cursor-ew-resize bg-accent/30'} style={{touchAction:'none'}}
          onPointerDown={event=>{
            if(event.button!==0)return
            event.preventDefault()
            const width=event.currentTarget.parentElement!.parentElement!.getBoundingClientRect().width
            if(!width)return
            beginBatch();drag.current={region,mode,x:event.clientX,width}
          }}
          onPointerUp={finish} onPointerCancel={finish}
          onKeyDown={event=>{
            if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return
            event.preventDefault();event.stopPropagation()
            patch(region,(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?1:0.1),mode)
          }}>{mode==='move'?region.label:''}</button>)}
      </div>
    </div>)}
  </div>
}
