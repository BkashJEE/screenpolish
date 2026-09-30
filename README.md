# ScreenPolish

A screen recorder that polishes the take for you. It zooms toward every click,
smooths the pointer path, and frames the result on a background. No account, no
upload, no telemetry — the recording never leaves your machine.

On Omarchy and other Hyprland desktops it records without the system cursor at
all, and draws its own instead.

<p>
  <img src="docs/images/features/screenpolish.svg" width="49%" alt="ScreenPolish: Record. Polish. Export. Local, private and free, for Omarchy / Hyprland and Windows.">
  <img src="docs/images/features/auto-zoom.svg" width="49%" alt="Automatic zoom: zooms toward every click and glides back out, from the clicks recorded with the take.">
</p>

<p>
  <img src="docs/images/features/cursor-free-capture.svg" width="49%" alt="Cursor-free capture: records Hyprland natively without the system cursor, then draws a clean one on top.">
  <img src="docs/images/features/edit.svg" width="49%" alt="Cut and transition: split at the playhead, remove what you don't need and smooth over every cut.">
</p>

<p>
  <img src="docs/images/features/captions.svg" width="49%" alt="Offline captions: transcribed on your machine with whisper.cpp and burned into the export. Nothing uploaded.">
  <img src="docs/images/features/export.svg" width="49%" alt="Export anywhere: MP4 or GIF up to 2160p at 60 fps, in 16:9, 9:16, 1:1 or the source shape.">
</p>

**[Every feature →](docs/FEATURES.md)**

## What it does

- **Records** a screen, a window or a region. On Hyprland that goes through
  `gpu-screen-recorder`: no share dialog, and the system cursor stays out of
  the video entirely.
- **Zooms on clicks**, built from the pointer path and button events recorded
  with the take, and glides back out.
- **Draws the pointer**: arrow, hand, dot or bobbing, with click ripples,
  optional click sounds, and a fade while the pointer rests.
- **Edits without an editor**: trim, split, drop clips, smooth over the cuts,
  remove silences, change speed, crop.
- **Captions offline**, with a bundled whisper.cpp — nothing uploaded.
- **Annotates**: blur or pixelate, arrows, highlight boxes, text and images.
- **Exports** MP4 or GIF up to 2160p at 60 fps, in 16:9, 9:16, 1:1 or the
  source shape.
- **Answers a command line** (`record`, `clip`, `export`), which makes it
  scriptable and usable by agents.

## What differs by platform

| | Linux (Hyprland) | Windows | macOS |
| --- | --- | --- | --- |
| Capture without the system cursor | yes, native | no | no |
| Drawn pointer replaces the real one | yes | overlay | captured cursor stays |
| Click and pointer log | evdev, mouse only | uiohook | uiohook |
| Offline captions | bundled | bundled, untested | bundled, untested |
| Everything else | yes | yes | yes |

Where the system cursor is captured, the drawn pointer styles have nothing to
replace, so zoom, framing, editing and export still work but the cursor in the
video is the real one.

## Install

Builds for each platform are on the
[releases page](https://github.com/BkashJEE/screenpolish/releases).

**Linux.** One file that checks your system, asks where the app should live,
and offers to install what is missing:

```bash
curl -fsSL https://github.com/BkashJEE/screenpolish/releases/latest/download/ScreenPolish-installer.run -o screenpolish.run
chmod +x screenpolish.run
./screenpolish.run
```

Or take the `.pacman` for Arch and Omarchy, or the `.AppImage` for anything
else. `./screenpolish.run --uninstall` removes exactly what it installed and
leaves your recordings alone.

**Windows.** Run the installer and pick where it goes. It is not code signed,
so SmartScreen will warn you: *More info* → *Run anyway*.

**macOS.** Unsigned as well, so macOS quarantines it:

```bash
xattr -dr com.apple.quarantine /Applications/ScreenPolish.app
```

## Requirements

- **Linux**: a Wayland session. `gpu-screen-recorder` for cursor-free native
  capture; without it, capture falls back to the desktop portal, where the
  system cursor is baked into the video. Membership of the `input` group so
  clicks can be recorded: `sudo usermod -aG input $USER`, then log out and
  back in. Without it there are no clicks, and automatic zoom has nothing to
  work from — the app says so at the start of a take.
- **Windows**: Windows 10 or 11.
- **macOS**: screen recording permission, granted on first use.
- **Building**: Node 22 or 24. Node 26 breaks Electron's own installer.

## Build and run

```bash
npm ci
npm run fetch:whisper     # captions engine and model, into vendor/whisper (Git Bash on Windows)
npm run dev               # run it
npx electron-builder --linux pacman AppImage --publish never
npx electron-builder --win nsis --publish never
npx electron-builder --mac dmg zip --publish never
```

Each platform's installer must be built on that platform, except that macOS
app bundles can be produced elsewhere — unsigned, which macOS will notice.

## Privacy

- Recordings, input logs and projects live in your recordings folder, by
  default `~/Videos/ScreenPolish`. Nothing else is written.
- On Linux keyboards are never opened: the pointer path comes from the
  compositor and button presses from a single evdev device.
- There is no network code in the app.

## Licence

AGPL-3.0-or-later; see `LICENSE`. In short: use it, change it, share it — and
if you distribute a modified version, or run one as a service, publish your
source too.

The name "ScreenPolish" and the logo are not covered by that licence.

Independent project: not affiliated with, endorsed by or sponsored by Omarchy,
Hyprland or any other project it works alongside. Bundled third-party
components are listed in `THIRD_PARTY_NOTICES.md`.
