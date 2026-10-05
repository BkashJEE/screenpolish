/**
 * Talking to the ScreenPolish CLI.
 *
 * The CLI is already the right shape for this: one command, one JSON object on
 * stdout, exit 0 on success. So the server's whole job is to find the binary,
 * run it, and turn a failure into something an agent can act on.
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import * as path from 'node:path'

export type PolishResult = { ok: true; [key: string]: unknown } | { ok: false; error: string }

/** Stopping a take finalizes it, and an export re-renders every frame. Neither is quick. */
export const DEFAULT_TIMEOUT_MS = 30_000
export const LONG_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Where the binary is. SCREENPOLISH_BIN wins, so a build that is not on PATH
 * can still be driven; otherwise the usual install location, then PATH.
 */
export function polishBinary(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.SCREENPOLISH_BIN
  if (override && override.length > 0) return override
  const installed = path.join(homedir(), '.local', 'bin', 'screenpolish')
  return existsSync(installed) ? installed : 'screenpolish'
}

/**
 * The CLI prints one JSON object, but Electron writes its own warnings to the
 * same streams on Linux (libva, dbus). Take the last line that parses, rather
 * than assuming the output is clean.
 */
export function parsePolishOutput(stdout: string): PolishResult | null {
  const lines = stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i] as string) as unknown
      if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed as PolishResult
    } catch {
      // Not the JSON line; keep looking backwards.
    }
  }
  return null
}

export class PolishError extends Error {}

/**
 * Run one CLI command. Throws PolishError with the CLI's own message, which is
 * written for a person and is the most useful thing an agent can be told.
 */
export async function runPolish(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const bin = polishBinary()
  const { stdout, failure } = await new Promise<{ stdout: string; failure: Error | null }>((resolve) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, out) => {
      resolve({ stdout: out ?? '', failure: err })
    })
  })

  const parsed = parsePolishOutput(stdout)
  if (parsed && parsed.ok) {
    const { ok: _ok, ...rest } = parsed
    return rest
  }
  if (parsed && !parsed.ok) throw new PolishError(parsed.error)

  // No JSON at all: the binary is missing, or it died before it could answer.
  if (failure && 'code' in failure && (failure as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new PolishError(
      `ScreenPolish was not found at "${bin}". Install it, or set SCREENPOLISH_BIN to the binary's full path.`
    )
  }
  if (failure && failure.message.includes('timed out')) {
    throw new PolishError(
      `ScreenPolish did not answer within ${Math.round(timeoutMs / 1000)}s running "${args.join(' ')}". ` +
        'A recording or export may still be running; check screenpolish_status before trying again.'
    )
  }
  throw new PolishError(
    `ScreenPolish gave no readable answer to "${args.join(' ')}"${failure ? `: ${failure.message}` : ''}`
  )
}
