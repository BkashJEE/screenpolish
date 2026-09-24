import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards a dev/prod divergence that has already bitten once.
 *
 * `polish://asset/<rel>` resolves against the repo's own `resources/` in dev, so
 * a missing entry in electron-builder's `files` allowlist is invisible until the
 * packaged app 404s. That is how `resources/icon.svg` — the mark in the studio
 * rail — shipped absent from 0.3.0's first build.
 *
 * Every asset the source references must therefore exist on disk *and* be
 * covered by a `files` pattern. The studio now uses `icon-256.png`; keep this
 * guard whenever a future icon format changes.
 */

const repoRoot = path.resolve(__dirname, '..', '..')

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(full, out)
    else if (/\.(ts|tsx|css|html)$/.test(entry.name)) out.push(full)
  }
  return out
}

/** The `files` list only uses exact paths and `dir/**`, so a full glob engine is overkill. */
function filesPatterns(): string[] {
  const yml = fs.readFileSync(path.join(repoRoot, 'electron-builder.yml'), 'utf8')
  const lines = yml.split(/\r?\n/)
  const start = lines.findIndex((l) => l.trim() === 'files:')
  expect(start).toBeGreaterThanOrEqual(0)
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    const m = /^\s+-\s+(\S+)\s*$/.exec(line)
    if (!m) break
    out.push(m[1])
  }
  return out
}

function isPackaged(rel: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    if (!p.endsWith('/**')) return p === rel
    const dir = p.slice(0, -3)
    // A reference can name the directory itself (a wasm fileset base path) or a
    // file inside it; `dir/**` covers both.
    return rel === dir || rel.startsWith(`${dir}/`)
  })
}

describe('polish://asset references', () => {
  const patterns = filesPatterns()
  const refs = new Set<string>()
  for (const file of sourceFiles(path.join(repoRoot, 'src'))) {
    const text = fs.readFileSync(file, 'utf8')
    for (const m of text.matchAll(/polish:\/\/asset\/([A-Za-z0-9_\-./]+)/g)) refs.add(m[1])
  }

  it('finds the references it is meant to guard', () => {
    expect(refs.size).toBeGreaterThan(0)
  })

  it.each([...refs])('%s exists in resources/ and is in the electron-builder files list', (rel) => {
    expect(fs.existsSync(path.join(repoRoot, 'resources', rel))).toBe(true)
    expect(isPackaged(`resources/${rel}`, patterns)).toBe(true)
  })
})
