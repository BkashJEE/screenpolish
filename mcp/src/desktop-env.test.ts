import { describe, expect, it } from 'vitest'
import { withDesktopSession, type RuntimeDirReader } from './desktop-env.js'

/** A fake XDG_RUNTIME_DIR: directory listings, which paths exist, and their ages. */
function runtime(dirs: Record<string, string[]>, existing: string[] = [], mtimes: Record<string, number> = {}): RuntimeDirReader {
  return {
    list: (dir) => dirs[dir] ?? [],
    exists: (p) => existing.includes(p),
    mtime: (p) => mtimes[p] ?? 0
  }
}

// What an agent host that trims the environment hands over.
const trimmed = { PATH: '/usr/bin', HOME: '/home/u', XDG_RUNTIME_DIR: '/run/user/1000' }

describe('withDesktopSession', () => {
  it('finds the compositor socket the host left out', () => {
    const io = runtime({ '/run/user/1000': ['bus', 'wayland-1.lock', 'wayland-1', 'pipewire-0'] })
    expect(withDesktopSession(trimmed, io, 'linux').WAYLAND_DISPLAY).toBe('wayland-1')
  })

  it('takes the first session when there are several, by number not by name', () => {
    const io = runtime({ '/run/user/1000': ['wayland-10', 'wayland-2', 'wayland-2.lock'] })
    expect(withDesktopSession(trimmed, io, 'linux').WAYLAND_DISPLAY).toBe('wayland-2')
  })

  it('picks the live Hyprland instance, not one a crashed session left behind', () => {
    const io = runtime(
      { '/run/user/1000/hypr': ['dead_1', 'live_2', 'older_live_0'] },
      ['/run/user/1000/hypr/live_2/.socket.sock', '/run/user/1000/hypr/older_live_0/.socket.sock'],
      { '/run/user/1000/hypr/dead_1': 300, '/run/user/1000/hypr/live_2': 200, '/run/user/1000/hypr/older_live_0': 100 }
    )
    expect(withDesktopSession(trimmed, io, 'linux').HYPRLAND_INSTANCE_SIGNATURE).toBe('live_2')
  })

  it('points D-Bus at the session bus when it exists', () => {
    const io = runtime({}, ['/run/user/1000/bus'])
    expect(withDesktopSession(trimmed, io, 'linux').DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/run/user/1000/bus')
  })

  it('never replaces a value the host did pass', () => {
    const io = runtime({ '/run/user/1000': ['wayland-0'], '/run/user/1000/hypr': ['other'] }, ['/run/user/1000/bus', '/run/user/1000/hypr/other/.socket.sock'])
    const env = { ...trimmed, WAYLAND_DISPLAY: 'wayland-1', HYPRLAND_INSTANCE_SIGNATURE: 'mine', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/x' }
    expect(withDesktopSession(env, io, 'linux')).toEqual(env)
  })

  it('adds nothing it cannot find, and leaves the input untouched', () => {
    const env = { ...trimmed }
    const out = withDesktopSession(env, runtime({}), 'linux')
    expect(out).toEqual(trimmed)
    expect(env).toEqual(trimmed)
  })

  it('does nothing off Linux or without a runtime dir', () => {
    const io = runtime({ '/run/user/1000': ['wayland-0'] })
    expect(withDesktopSession(trimmed, io, 'darwin')).toBe(trimmed)
    const { XDG_RUNTIME_DIR: _r, ...noRuntime } = trimmed
    expect(withDesktopSession(noRuntime, io, 'linux')).toBe(noRuntime)
  })

  it('reads the real runtime dir by default', () => {
    expect(withDesktopSession({ XDG_RUNTIME_DIR: '/definitely/not/here' }, undefined, 'linux')).toEqual({ XDG_RUNTIME_DIR: '/definitely/not/here' })
  })
})
