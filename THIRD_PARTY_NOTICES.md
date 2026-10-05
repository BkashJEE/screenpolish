# Third-party notices

ScreenPolish bundles the components below. Each keeps its own licence; this
file travels with every installer (`resources/THIRD_PARTY_NOTICES.md`).
ScreenPolish itself is MIT licensed; see `LICENSE`. That does not change the
terms of anything listed here — in particular FFmpeg stays GPL-3.0, and the
offer of its source below applies to every installer that bundles it.

## Bundled programs

| Component | Version | Licence | Where it ships | Licence text |
| --- | --- | --- | --- | --- |
| [FFmpeg](https://ffmpeg.org), via [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | ffmpeg-static 5.3.0 | GPL-3.0-or-later | `resources/ffmpeg` (`ffmpeg.exe` on Windows) | `resources/ffmpeg.LICENSE` |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) `whisper-cli` | v1.9.3 (371b5a7); on Windows the prebuilt `whisper-bin-x64.zip` from release b4938 (same commit) | MIT | `resources/whisper/` | `resources/whisper/LICENSE` |
| Whisper `ggml-base.en.bin` model ([OpenAI Whisper](https://github.com/openai/whisper) weights converted by whisper.cpp) | base.en | MIT, Copyright (c) 2022 OpenAI | `resources/whisper/` | <https://github.com/openai/whisper/blob/main/LICENSE> |
| [Electron](https://www.electronjs.org) | 40.10.2 | MIT, plus Chromium's licences | the application itself | `LICENSE.electron.txt`, `LICENSES.chromium.html` beside the executable |

**FFmpeg source.** The binaries are unmodified static builds that ffmpeg-static
downloads: Linux from <https://johnvansickle.com/ffmpeg/>, Windows from
<https://www.gyan.dev/ffmpeg/builds/>, macOS from <https://evermeet.cx/pub/ffmpeg/> (Intel) and <https://osxexperts.net/> (Apple Silicon).
Each build's page links its complete corresponding source; FFmpeg's own source
is at <https://ffmpeg.org/download.html>. ScreenPolish runs FFmpeg as a separate
program and does not link to it.

## JavaScript libraries bundled into the app

| Package | Version | Licence |
| --- | --- | --- |
| [mediabunny](https://github.com/Vanilagy/mediabunny) | 1.55.5 | MPL-2.0 (unmodified; source at the link) |
| [@mediapipe/tasks-vision](https://github.com/google-ai-edge/mediapipe) | 1.0.1 | Apache-2.0 (`resources/segmenter/MediaPipe-LICENSE.txt`) |
| [koffi](https://github.com/Koromix/koffi) | 3.1.6 | MIT |
| [uiohook-napi](https://github.com/SnosMe/uiohook-napi) (Windows input hook; includes libuiohook) | 1.5.5 | MIT; libuiohook's sources carry LGPL-3.0-or-later headers |
| [React](https://github.com/facebook/react), React DOM | 19.2.7 | MIT |

## Assets

| Asset | Source | Licence |
| --- | --- | --- |
| `resources/segmenter/selfie_segmenter.tflite`, `vision_wasm_internal.*` | MediaPipe (Google) | Apache-2.0, `resources/segmenter/MediaPipe-LICENSE.txt` |
| `resources/backgrounds/omarchy.png`, `resources/fonts/Omarchy.ttf` | basecamp/omarchy | MIT, `resources/fonts/Omarchy-LICENSE.txt` |
| Instrument Sans, JetBrains Mono, Courier Prime | Their upstream projects | SIL OFL 1.1, beside each font in `resources/fonts/` |
| Font Awesome staff-snake glyph (U+E90A inside `Omarchy.ttf`, never drawn) | Font Awesome | CC BY 4.0 |

## Music

The tracks in `resources/music/` were written for this project by
`scripts/lofi-tracks.py`: every sound is computed, nothing is sampled, and no
third party holds rights in them. They carry the project's own licence, and
using a recording made with them owes nobody anything.

Run the script to rebuild them, or to make your own — each track is
deterministic from its seed, so a rebuild reproduces the same audio.

## Names and marks

Omarchy is a mark of its authors. MIT and OFL licences cover code and artwork
but grant no trademark rights. ScreenPolish uses the name only to say which
desktop this edition is for, and is not affiliated with or endorsed by that
project.
Omarchy is a mark of its authors. MIT and OFL licences cover code and artwork
but grant no trademark rights. ScreenPolish uses these names only to label the
matching themes, and is not affiliated with or endorsed by either project.
Permission for the marks must be confirmed before any public release.
