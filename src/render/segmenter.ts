import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

/**
 * Person mask for the webcam bubble.
 *
 * Best-effort on purpose. Segmentation sits on top of a recording that must
 * never fail because of it, so a missing model, a WASM that will not
 * instantiate, or a GPU delegate that gives up all end in "no mask" and the
 * caller draws the camera plainly. The failure is logged once, not per frame.
 *
 * The runtime and the model are bundled under resources/segmenter and served by
 * the polish:// asset route, so nothing here touches the network.
 */

const WASM_BASE = 'polish://asset/segmenter'
const MODEL = 'polish://asset/segmenter/selfie_segmenter.tflite'

let segmenter: ImageSegmenter | null = null
let loading: Promise<void> | null = null
let warned = false

function warnOnce(err: unknown): void {
  if (warned) return
  warned = true
  console.warn('[segmenter] unavailable; webcam backdrops will be skipped', err)
}

/** Starts loading and resolves when the attempt is over, successful or not. Never rejects. */
export function loadSegmenter(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
        segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false
        })
      } catch (err) {
        segmenter = null
        warnOnce(err)
      }
    })()
  }
  return loading
}

export interface MaskFrame {
  /** Non-zero where the person is. One byte per pixel, row-major. */
  data: Uint8Array
  width: number
  height: number
}

/**
 * MediaPipe requires strictly increasing timestamps and the render loop can
 * scrub backwards, so this keeps its own monotonic clock instead of passing the
 * frame time.
 */
let clock = 0

/** Null whenever a mask is unavailable for any reason; callers must handle that. */
export function segmentPerson(source: CanvasImageSource): MaskFrame | null {
  if (!segmenter) {
    void loadSegmenter()
    return null
  }
  try {
    clock += 33
    const result = segmenter.segmentForVideo(source as Parameters<ImageSegmenter['segmentForVideo']>[0], clock)
    const mask = result.categoryMask
    if (!mask) {
      result.close()
      return null
    }
    const frame: MaskFrame = { data: new Uint8Array(mask.getAsUint8Array()), width: mask.width, height: mask.height }
    result.close()
    return frame
  } catch (err) {
    warnOnce(err)
    return null
  }
}
