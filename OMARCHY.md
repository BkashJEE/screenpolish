# ScreenPolish on Omarchy

**Status: tested on development hardware, with limitations.**
Platform summary reviewed 21 September 2026. Dated results below describe the
specific builds tested, not a guarantee for every laptop or current build.

## Current capture paths

Native capture uses gpu-screen-recorder when available. When native capture
cannot handle the selected source, the app falls back to the Wayland share
dialog. The picker instructions below apply to that fallback, not every take.
Native cursor-free capture allows a reconstructed pointer; a cursor baked into
a fallback recording cannot be removed by changing its style later.

System audio uses PipeWire's output monitor. Click-driven zoom needs working
input-device permissions and Hyprland pointer tracking. Captions use the bundled
Linux Whisper engine. Check a short take before recording a long demo.

## Build and update

Use the latest verified `omarchy` branch. Follow [AGENTS.md](AGENTS.md), preserve
local changes and recordings, then run `npm ci`, `npm run typecheck`, and
`npm test`. Ensure `vendor/whisper` exists with `npm run fetch:whisper` before
`npm run pack`; the unpacked build is in `release/linux-unpacked`.

Keep the previous installation for rollback. Never replace or stop a running
app during a take; check recording status and gpu-screen-recorder first.
After updating, verify capture, input tracking, playback and an exported clip.

See [all implemented features](docs/FEATURES.md), [Windows](WINDOWS.md) and
[macOS — untested](MACOS.md).

## Recording

Choose the complete monitor in the Wayland share picker for a full desktop
recording. A window selection records that window's size, including tiled
windows. Select the same surface in the picker that you intend to interact with.

Use the tray's Stop action or open the library and press Stop recording.
`screenpolish record stop` also finalizes safely. Global shortcuts request the
Wayland shortcut portal, but availability depends on the desktop's portal backend.

## Camera and pointer effects

Automatic zoom is applied after recording. Cinematic mode cycles zoom, tilt,
drift, an opposing tilt and orbit. Select a timeline zoom segment to choose its
own style: straight zoom, four tilt directions, drift, punch, spring, pan left,
pan right, or orbit. Editing an automatic segment preserves it as a manual one.

The Hand recording preference now carries into new projects. In the editor,
Cursor offers Hand, Arrow and Dot, plus size, smoothing and click ripples.
These controls affect both preview and export.

## Verified and remaining limitations

- TypeScript and 481 tests pass for the September 15 build.
- Linux system audio uses the default PipeWire output monitor (pw-cat/pactl).
  Native recording, pause exclusion and stereo AAC output were tested.
- Recording shortcuts can be edited in Capture → Recording shortcuts.
- Speed/audio regions have draggable timeline lanes; speed changes preserve
  pitch by default. A 440 Hz tone remained 440 Hz in a 2× export test.
- A 12-second 720p MP4 with hand pointer, spring, pan and perspective effects
  exported successfully using software rendering on the development build.
- Wayland uses software compositing to avoid observed EGL image import errors.
  CPU consumption can be higher than hardware compositing.
- The live hand overlay remains unavailable on Wayland. Content-protected
  overlay windows previously produced blank/green captures.
- Some portal sources include the native arrow. Set Cursor Size to Hidden if
  you prefer the recorded arrow to a second drawn cursor; a baked-in arrow
  cannot be removed just by changing the editor cursor style.
- Source coordinates are inferred from compositor geometry. Ambiguous windows,
  moved/resized windows and arbitrary portal regions still need validation.
- Clip-to-clip match cuts, whip pans and cursor-led scene reveals are not part
  of this build. The camera styles operate within one recording.

Use a short recording to check cursor alignment before recording a long demo.

## Zoom stabilization (September 15)

Camera follow now uses its own symmetric low-pass filter, leaving the hand
pointer's visual timing unchanged. Overlapping zooms transition at the incoming
segment's start instead of jumping into its in-progress motion. Regression tests
cover fast pointer wobble, constant-speed pans, seek order and overlap boundaries.
This applies when replaying or re-exporting existing projects; it does not require
recording again. It does not establish that every software-rendered preview can
maintain its target frame rate.

## Export canvas isolation (September 15)

Preview and thumbnail videos now request anonymous CORS before assigning their
media URLs. Tilted-card and webcam scratch buffers are scoped to their destination
context, so a preview buffer cannot carry an origin-tainted state into export.
Clearing canvas pixels alone does not clear that security state. A regression
test verifies buffer isolation and reuse; TypeScript and all 486 tests pass.
Installed-build verification reproduced the tainted-source error on the previous
build, then exported the same 185.47-second project with its tilted zooms on the
updated build: 1920×1080 H264 with AAC audio, without changing project settings.

## Playback and live capture pacing (September 15)

Playback uses a maximum 1280×720 backing surface and a 30fps draw budget; paused
editing restores full resolution. Timeline updates are limited to 10Hz without
changing the media clock. Export resolution and frame rate remain independent.
New project export FPS follows the selected recording FPS rather than always 30.
Where MediaStreamTrackProcessor exists, capture uses incoming frame timestamps
instead of the library's fixed-rate timer that repeats old frames during stalls.
The older timed path remains a compatibility fallback.

Validation: 492 tests and TypeScript pass. An installed-renderer synthetic capture
encoded all 12 delivered frames without extra timer frames. The real clip advanced
4 seconds in a 4-second playback check with 720p playback/full-resolution pause;
observed draw gaps still reached 50ms under desktop load, so this is not a guarantee
of perfectly even playback or of a stall-free PipeWire recording. Existing baked-in
stalls cannot be repaired by changing the preview. A fresh real capture remains
necessary to assess compositor/encoder stalls.

## Reliability follow-up (September 15)

Supersedes the event-only capture change above: fixed-rate sampling is restored
because an unchanged portal surface can stop emitting frames; ending a take then
must retain its still tail. Installed-renderer synthetic test: 12 source updates
plus 500ms still time produced a 1.40-second recording, preserving elapsed time.

Preview now uses fixed wall-clock deadlines on requestAnimationFrame rather than
rescheduling from the previous draw/video callback, and avoids rewriting unchanged
media playback-rate/pitch properties. Installed checks on the user's 55.9s clip:
120 draws/4 seconds in the opening section and 110 draws/4 seconds in the zoomed
section; both reported zero dropped decoded video frames. Largest observed draw
gap was 53ms: improved, not a universal guarantee of perfect frame pacing.

Actual stream cursor mode (when reported) is now saved with events and respected
on playback/export. A reported embedded native pointer suppresses the synthetic
hand rather than drawing two pointers. Unknown/legacy streams keep the earlier
fallback, so duplicate-cursor prevention is not guaranteed for those backends.
The live Wayland hand-overlay limitation still applies. TypeScript/495 tests pass.
