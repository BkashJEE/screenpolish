import { BufferTarget, CanvasSource, Mp4OutputFormat, Output } from 'mediabunny'
import { renderFrame, frameGeometry } from '../render/render-frame'
import { DEFAULT_PROJECT, type RecordingEvents, type ZoomSegment } from '../shared/types'
import { pickVideoEncoding } from './lib/export'

// DEV-only entry, excluded from the production renderer inputs.
const result = document.querySelector('#result')!
document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  const lines: string[] = []
  const check = (ok: boolean, label: string) => { if (!ok) throw Error(label); lines.push(`PASS ${label}`); result.textContent = lines.join('\n') }
  try {
    const foreign = new Image()
    const url = new URL('polish://asset/backgrounds/omarchy.png', location.href)
    // Vite's QA transform maps the bundled asset path; use the other loopback
    // hostname to intentionally create a cross-origin, non-CORS preview source.
    url.hostname = location.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'
    foreign.src = url.href
    await foreign.decode()
    const project = structuredClone(DEFAULT_PROJECT)
    project.webcam.enabled = false
    const events: RecordingEvents = {version: 1, startedAt: 0, region: {x: 0,y: 0,width: 320,height: 180,scale: 1},pointer: [],clicks: [],keys: [],wheel: []}
    const segments: ZoomSegment[] = [{id:'tilt',start:0,end:3,x:160,y:90,scale:1.2,source:'manual',style:'tilt-right'}]
    const input = {video: foreign as CanvasImageSource,videoSize:{width:320,height:180},project,events,segments,pointerPath:[],tSec:1,duration:3}
    check(Math.abs(frameGeometry(input,{width:320,height:180}).camera.tiltX ?? 0) > 0, 'tilt path exercised')
    const preview = new OffscreenCanvas(320,180)
    renderFrame(preview.getContext('2d')!, input)
    let blocked = false
    try { const f = new VideoFrame(preview,{timestamp:0}); f.close() } catch (e) { blocked = e instanceof DOMException && e.name === 'SecurityError' }
    check(blocked,'foreign preview is genuinely tainted')
    const clean = new OffscreenCanvas(320,180)
    clean.getContext('2d')!.fillRect(0,0,320,180)
    const exported = new OffscreenCanvas(320,180)
    renderFrame(exported.getContext('2d')!, {...input,video:clean})
    const frame = new VideoFrame(exported,{timestamp:0}); frame.close()
    check(true,'clean export after tainted preview accepts VideoFrame')
    const target = new BufferTarget()
    const output = new Output({format:new Mp4OutputFormat(),target})
    const choice = await pickVideoEncoding(320,180,500000,30)
    const source = new CanvasSource(exported,choice)
    output.addVideoTrack(source,{frameRate:30})
    await output.start()
    for(let n=0;n<15;n++) await source.add(n/30,1/30)
    await output.finalize()
    check((target.buffer?.byteLength ?? 0)>0,`MP4 encoded ${target.buffer?.byteLength} bytes (${choice.codec})`)
    const second = new OffscreenCanvas(320,180)
    renderFrame(second.getContext('2d')!,{...input,video:clean})
    const secondFrame = new VideoFrame(second,{timestamp:0}); secondFrame.close()
    check(true,'second export stays clean')
  } catch (error) { result.textContent = lines.join('\n') + '\nFAIL ' + String(error) }
}
