# Contributing

Thanks for looking. This is a small project with a narrow scope: a screen
recorder for Omarchy / Hyprland that polishes a take without a video editor,
and keeps everything on your machine.

## Before a big change

Open an issue first. A change that adds a dependency, a network call or a
telemetry hook will be declined, however well written.

## What a change needs

- `npm run typecheck` and `npm test` pass. Use Node 22 or 24; Node 26 breaks
  Electron's installer.
- A test for the behaviour you changed, close to the code it covers.
- Verification in the running app (`npm run dev`) for anything visible. Tests
  pass on code that is invisible or broken in the interface.
- Commits that explain what was wrong and why the change fixes it.

## Sign-off

By sending a pull request you agree that your contribution is licensed under
this project's MIT licence. If you are not comfortable with that, open an issue
and we can talk about the change instead.

## What is out of scope

- Cloud accounts, uploads or hosted sharing.
- Telemetry or crash reporting that leaves the machine.
- Windows and macOS support: this edition is Linux only.
