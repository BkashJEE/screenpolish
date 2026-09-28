# ScreenPolish on Windows

**Status: implemented; latest installer validation on your laptop is still required.**
Reviewed 21 September 2026. Shared-code tests on Linux do not establish Windows
installer or device compatibility.

## Available implementation

- Screen, window and region recording.
- Microphone, webcam and WASAPI system audio capture.
- Click-driven zoom, editor effects and MP4/GIF export.
- Windows cursor hiding and a live overlay pointer, with a system-cursor option.
- Library, keyboard shortcuts and command-line recording controls.

See [the feature showcase](docs/FEATURES.md) for shared editing capabilities.
The live pointer overlay and the pointer rendered into the exported video are
separate settings. Keeping the system cursor records it into the source video.

## Build and update

1. Read [AGENTS.md](AGENTS.md) and [the handoff](docs/HANDOFF.md).
2. Use a clean checkout of the latest verified `windows` branch. It preserves
   Windows-only packaging beyond the shared `omarchy`/`main` code.
3. Run `npm ci`, `npm run typecheck`, `npm test`, then `npm run dist` on Windows.
4. Follow the Windows branch's package verification and postdist checks.
5. Keep the previous installer and preserve recordings, projects and settings.
6. Check recording status before closing the app. Install and relaunch only
   when no recording is active.

The NSIS installer is produced under `release`. Build output is not proof that
an installer has been published or automatically delivered to your device.

## Verification checklist

- [ ] Installer launches and the installed version/commit is identified.
- [ ] Capture and Library open as distinct views.
- [ ] A short screen/window recording plays correctly.
- [ ] Selected microphone, system audio and webcam work on this laptop.
- [ ] Click tracking, zoom and the chosen pointer behave correctly.
- [ ] MP4 export plays with audio and correct dimensions.
- [ ] Existing projects and recordings remain accessible.

## Known limitations

- Windows Whisper engine packaging is pending; do not advertise local captions
  as verified on Windows.
- Hardware encoding depends on the device, driver and codec availability.
- The latest shared changes have passed CI, not a new Windows hardware test.
- Do not assume the presence of a build means auto-update is working.

[Omarchy guide](OMARCHY.md) · [macOS guide — untested](MACOS.md)
