// Loudness of a recorded audio track, window by window, for silence removal.
// Decodes with the same mediabunny path the exporter uses; the arithmetic is
// shared/silence.ts's LevelMeter.

import { ALL_FORMATS, AudioSampleSink, Input, UrlSource } from 'mediabunny'
import { LEVEL_WINDOW_SEC, LevelMeter } from '../../shared/silence'

export async function audioLevels(url: string, signal?: AbortSignal): Promise<{ levels: Float32Array; windowSec: number }> {
  const input = new Input({ source: new UrlSource(url), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) throw new Error('This recording has no audio that can be decoded')
    const meter = new LevelMeter(await input.computeDuration(), LEVEL_WINDOW_SEC)
    const sink = new AudioSampleSink(track)
    for await (const sample of sink.samples()) {
      try {
        if (signal?.aborted) throw new DOMException('Silence analysis cancelled', 'AbortError')
        const data = new Float32Array(sample.allocationSize({ planeIndex: 0, format: 'f32' }) / Float32Array.BYTES_PER_ELEMENT)
        sample.copyTo(data, { planeIndex: 0, format: 'f32' })
        meter.add(data, sample.numberOfFrames, sample.numberOfChannels, sample.sampleRate, sample.timestamp)
      } finally {
        sample.close()
      }
    }
    return { levels: meter.levels(), windowSec: LEVEL_WINDOW_SEC }
  } finally {
    input.dispose()
  }
}
