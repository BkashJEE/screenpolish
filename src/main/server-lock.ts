/**
 * Making "one server, exactly once" actually hold.
 *
 * Two races made the CLI unusable, and both are fixed here rather than in the
 * callers, so they can be tested without starting Electron:
 *
 * 1. A CLI client that finds no server takes the single-instance lock, releases
 *    it, spawns a server, then polls by taking the lock again every 400 ms.
 *    If the new server asked for the lock inside one of those windows it was
 *    refused and quit immediately — the client had spawned a server and then
 *    killed it, and the command timed out. `acquireSingleInstanceLock` retries
 *    instead of trusting one refusal.
 *
 * 2. Several CLI calls in a row each found no server and each spawned one, so
 *    three `quit` calls left three live apps. `claimServerSpawn` lets only the
 *    first through, and lets a later one through again once the claim is stale
 *    (the spawn died before the app came up).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

/** A claim older than this is assumed dead, so a server can still be started. */
export const SPAWN_CLAIM_STALE_MS = 30_000

export interface SpawnClaimFs {
  mkdirSync: (dir: string, options: { recursive: true }) => void
  openSync: (file: string, flags: string) => number
  closeSync: (fd: number) => void
  writeSync: (fd: number, text: string) => void
  statSync: (file: string) => { mtimeMs: number }
  unlinkSync: (file: string) => void
}

/**
 * True when this process should spawn the server. The claim is a file created
 * exclusively, so of several callers only one wins; `now` and `staleMs` decide
 * when an abandoned claim stops blocking a fresh attempt.
 */
export function claimServerSpawn(
  dir: string,
  now: number = Date.now(),
  staleMs: number = SPAWN_CLAIM_STALE_MS,
  fsys: SpawnClaimFs = fs as unknown as SpawnClaimFs
): boolean {
  const file = path.join(dir, 'server.spawn')
  try {
    fsys.mkdirSync(dir, { recursive: true })
  } catch {
    // The directory already exists, or cannot be made; the open below decides.
  }
  try {
    const fd = fsys.openSync(file, 'wx')
    try {
      fsys.writeSync(fd, String(now))
    } finally {
      fsys.closeSync(fd)
    }
    return true
  } catch {
    // Somebody holds the claim. Take it over only once it is clearly stale.
  }
  let age: number
  try {
    age = now - fsys.statSync(file).mtimeMs
  } catch {
    // The claim vanished between the open and the stat: try once more.
    return claimAfterUnlink(file, dir, now, fsys)
  }
  if (age < staleMs) return false
  return claimAfterUnlink(file, dir, now, fsys)
}

function claimAfterUnlink(file: string, _dir: string, now: number, fsys: SpawnClaimFs): boolean {
  try {
    fsys.unlinkSync(file)
  } catch {
    // Another process got there first; it owns the claim now.
  }
  try {
    const fd = fsys.openSync(file, 'wx')
    try {
      fsys.writeSync(fd, String(now))
    } finally {
      fsys.closeSync(fd)
    }
    return true
  } catch {
    return false
  }
}

/** Drop the claim once the server is up, so the next start is not made to wait. */
export function releaseServerSpawn(dir: string, fsys: Pick<SpawnClaimFs, 'unlinkSync'> = fs as unknown as SpawnClaimFs): void {
  try {
    fsys.unlinkSync(path.join(dir, 'server.spawn'))
  } catch {
    // Never started, or already gone.
  }
}

/** Block the calling thread. Startup runs before any event loop work, so this cannot deadlock. */
export function sleepSync(ms: number): void {
  if (!(ms > 0)) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Ask for the single-instance lock, retrying a refusal. A CLI client polling
 * for us holds the lock for a moment at a time, and quitting on the first
 * refusal is what made a freshly spawned server disappear.
 */
export function acquireSingleInstanceLock(
  request: () => boolean,
  tries = 6,
  waitMs = 250,
  sleep: (ms: number) => void = sleepSync
): boolean {
  const attempts = Math.max(1, tries)
  for (let i = 0; i < attempts; i++) {
    if (request()) return true
    if (i < attempts - 1) sleep(waitMs)
  }
  return false
}

/**
 * The executable a spawned server should run. Inside an AppImage `execPath` is
 * the current mount under /tmp, which is private to this launch: spawning from
 * it leaves the mount pinned and ties the server's life to a path that only
 * exists for as long as this process does. APPIMAGE is the real file on disk.
 */
export function serverExecutable(env: NodeJS.ProcessEnv = process.env, execPath: string = process.execPath): string {
  const appimage = env.APPIMAGE
  return appimage && appimage.length > 0 ? appimage : execPath
}
