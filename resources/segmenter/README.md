# Webcam segmenter

The webcam bubble's background removal (`src/render/segmenter.ts`) runs
MediaPipe's image segmenter locally:

- `selfie_segmenter.tflite`: MediaPipe's selfie segmentation model.
- `vision_wasm_internal.js`, `vision_wasm_internal.wasm`: the WebAssembly
  runtime from the `@mediapipe/tasks-vision` npm package (1.0.1), copied
  unchanged.

Source: <https://github.com/google-ai-edge/mediapipe>. Licence: Apache-2.0; the
full text travels with these files as `MediaPipe-LICENSE.txt`, copied from that
repository's `LICENSE` (the npm package ships without one).
