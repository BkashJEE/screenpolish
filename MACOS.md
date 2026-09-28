# ScreenPolish on macOS

> **EXPERIMENTAL — NOT TESTED ON MAC HARDWARE.**
> The macOS features, installation and end-to-end recording workflow have not
> been verified. Packaging configuration is not a claim of working support.

Reviewed 21 September 2026.

## What exists in the repository

- Electron packaging targets for DMG and ZIP.
- CI configuration for Apple Silicon and Intel builds.
- Shared editor and rendering code.
- Camera, microphone and screen-capture permission descriptions.

These are implementation/configuration facts, **not verified macOS features**.
The [feature showcase](docs/FEATURES.md) must not be read as a Mac compatibility
promise. No minimum macOS version or supported-device matrix has been verified.

## Known limitations

- Builds are unsigned; signing/notarization and installation need validation.
- System audio is not supported by the current macOS path.
- The system cursor remains baked into the recording; Windows cursor hiding
  and the Omarchy native cursor-free path do not apply.
- The bundled captions engine is Linux-only.
- Input tracking, automatic click zoom, webcam, microphone, playback and export
  still require actual Mac tests, even where shared implementation exists.

## For a future Mac tester

Use a clean checkout of the verified shared `main` branch and follow
[AGENTS.md](AGENTS.md). Build on a Mac, not by copying Linux dependencies.
Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, then the macOS
packaging command from [the build workflow](.github/workflows/build.yml).
Do not disable OS security protections as a blanket workaround.

Before changing this document's status, record the exact commit, macOS version,
hardware architecture, permission results and evidence for:

- [ ] Installation and launch on Apple Silicon.
- [ ] Installation and launch on Intel, if claiming Intel support.
- [ ] Screen/window capture with correct dimensions.
- [ ] Microphone and webcam capture.
- [ ] Input tracking and zoom behaviour.
- [ ] Cursor behaviour and documented limitations.
- [ ] Editing, MP4/GIF export, audio sync and playback.
- [ ] Safe update/rollback with existing recordings preserved.

Until those checks are completed, describe macOS as **untested experimental
build support**, not a ready or fully supported app.

[Omarchy guide](OMARCHY.md) · [Windows guide](WINDOWS.md)
