import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Windows and macOS implementations live in src/main/win/ only. The public
 * Omarchy edition is built by replacing that one directory, so an import of a
 * Windows-only dependency anywhere else would leak into it — and would also
 * crash a Wayland session, which is why uiohook is loaded lazily at all.
 */
const WINDOWS_ONLY = ['uiohook-napi', 'koffi']
const SRC = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('platform boundary', () => {
  const files = sourceFiles(SRC).filter((f) => !f.includes(`${join('main', 'win')}`))

  it.each(WINDOWS_ONLY)('imports %s only from src/main/win', (pkg) => {
    const offenders = files.filter((f) => new RegExp(`from '${pkg}'|import\\('${pkg}'\\)`).test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.replace(`${SRC}/`, ''))).toEqual([])
  })

  it('keeps the Windows directory to the modules the export replaces', () => {
    expect(readdirSync(join(SRC, 'main', 'win')).sort()).toEqual([
      'cursor-manager.ts',
      'foreground-title.ts',
      'mouse-wiggler.ts',
      'uiohook-source.ts',
      'window-region.ts'
    ])
  })
})
