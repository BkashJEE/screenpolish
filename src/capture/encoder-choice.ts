// Pick a live-capture video encoder that this machine can actually open.
//
// Codec support alone is not enough: Chromium reports H.264 as encodable
// through its software encoder, but configuring the same codec with
// `prefer-hardware` fails where no GPU encoder is exposed (NVIDIA on Linux,
// which has no VA-API path). Each candidate is therefore probed together with
// its acceleration preference, hardware first.

export type CaptureVideoCodec = 'avc' | 'hevc' | 'vp9'
export type CaptureAcceleration = 'prefer-hardware' | 'no-preference'
export interface CaptureEncoderChoice {
  codec: CaptureVideoCodec
  hardwareAcceleration: CaptureAcceleration
}

export const CAPTURE_ENCODER_CANDIDATES: readonly CaptureEncoderChoice[] = [
  { codec: 'avc', hardwareAcceleration: 'prefer-hardware' },
  { codec: 'hevc', hardwareAcceleration: 'prefer-hardware' },
  { codec: 'avc', hardwareAcceleration: 'no-preference' },
  { codec: 'vp9', hardwareAcceleration: 'no-preference' }
]

export type EncoderProbe = (choice: CaptureEncoderChoice) => Promise<boolean>

export async function chooseCaptureEncoder(probe: EncoderProbe): Promise<CaptureEncoderChoice | null> {
  for (const candidate of CAPTURE_ENCODER_CANDIDATES) {
    try {
      if (await probe(candidate)) return candidate
    } catch {
      // A probe that throws is an unsupported configuration; try the next one.
    }
  }
  return null
}
