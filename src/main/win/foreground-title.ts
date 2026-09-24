// Linux edition: the foreground window title comes from the compositor when a
// window is captured; there is no user32 here, so a take keeps its timestamp
// name unless the capture target supplies one.

export function foregroundWindowTitle(): string | null {
  return null
}
