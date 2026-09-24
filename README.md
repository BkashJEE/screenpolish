# ScreenPolish for Omarchy

A screen recorder that polishes the take for you, for Omarchy / Hyprland.
It records without the system cursor, then draws its own: zooms toward every
click, smooths the pointer path, and frames the result on a background. No
account, no upload, no telemetry — the recording never leaves your machine.

## What it does

- **Records** a screen, a window or a region through `gpu-screen-recorder`:
  no share dialog, and the system cursor stays out of the video.
- **Zooms on clicks**, from the pointer path and button events it captured, and
  glides back out.
- **Draws the pointer** it recorded: arrow, hand, dot or bobbing, with click
  ripples, optional click sounds, and a fade while the pointer rests.
- **Edits without an editor**: trim, split, drop clips, smooth over the cuts,
  remove silences, change speed, crop.
- **Captions offline**, with a bundled whisper.cpp — nothing is uploaded.
- **Annotates**: blur or pixelate, arrows, highlight boxes, text and images.
- **Exports** MP4 or GIF up to 2160p at 60 fps, in 16:9, 9:16, 1:1 or the
  source shape.
- **Answers a command line** (`record`, `clip`, `export`), which makes it
  scriptable and usable by agents.

## Requirements

- Omarchy or another Hyprland session on Wayland.
- `gpu-screen-recorder` for cursor-free native capture. Without it, capture
  falls back to the desktop portal, where the system cursor is baked into the
  video and the drawn pointer styles cannot replace it.
- Membership of the `input` group, so clicks can be recorded:
  `sudo usermod -aG input $USER`, then log out and back in. Without it there
  are no clicks, and automatic zoom has nothing to work from — the app says so
  at the start of a take rather than producing an empty log quietly.
- Node 22 or 24 to build. Node 26 breaks Electron's own installer.

## Build and run

```bash
npm ci
npm run fetch:whisper     # captions engine and model, into vendor/whisper
npm run dev               # run it
npx electron-builder --linux pacman --publish never   # build a package
```

## Privacy

- Recordings, input logs and projects live in your recordings folder, by
  default `~/Videos/ScreenPolish`. Nothing else is written.
- Keyboards are never opened on Linux. The pointer path comes from the
  compositor, and button presses from a single evdev device.
- There is no network code in the app.

## Licence

AGPL-3.0-or-later; see `LICENSE`. In short: use it, change it, share it — and
if you distribute a modified version, or run one as a service, publish your
source too.

The name "ScreenPolish" and the logo are not covered by that licence.

Independent project: not affiliated with, endorsed by or sponsored by Omarchy,
Hyprland or any other project it works alongside. Bundled third-party
components are listed in `THIRD_PARTY_NOTICES.md`.
