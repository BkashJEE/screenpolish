/**
 * Asking an agent you already use to plan a recording.
 *
 * ScreenPolish has no network code and keeps it that way: the agent's own
 * command line does the thinking, run once per question with its tools off,
 * and its reply comes back as text. Two agents are found on PATH by
 * themselves; any other is added in userData/plan-agents.json:
 *
 *   [{ "name": "Ada", "command": ["some-agent", "--profile", "ada", "{prompt}"] }]
 *
 * `{prompt}` becomes the question and `{output}`, if present, a file the
 * agent writes its answer to. The editor only ever names an agent by id;
 * the command always comes from this file or the built-ins, and that file is
 * read here and written by nothing in the app, so a page in the editor cannot
 * choose what runs.
 */

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export interface PlanAgent {
  id: string
  name: string
  command: string[]
}

export const PLAN_AGENTS_FILE = 'plan-agents.json'
export const PLAN_AGENT_TIMEOUT_MS = 4 * 60 * 1000
/** argv limit on Linux is 128 KiB per argument; stay well under it. */
export const PLAN_PROMPT_MAX = 60_000

/** Agents that need no setup when their command is installed. Tools are switched off in each. */
export const BUILTIN_AGENTS: readonly PlanAgent[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: ['claude', '-p', '{prompt}', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'text']
  },
  {
    id: 'codex',
    name: 'Codex',
    command: ['codex', 'exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--color', 'never', '-o', '{output}', '{prompt}']
  }
]

/** Agents from plan-agents.json; anything malformed is skipped, never run. */
export function parseUserAgents(raw: unknown): PlanAgent[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return raw.flatMap((entry, i) => {
    const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
    const name = typeof e.name === 'string' ? e.name.trim().slice(0, 40) : ''
    const command = Array.isArray(e.command) && e.command.every((a) => typeof a === 'string') ? (e.command as string[]) : null
    if (!name || !command || command.length === 0 || command.length > 32 || !command[0] || !command.includes('{prompt}')) return []
    const id = `custom-${i}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, name, command }]
  })
}

/** Whether a command can be found, the way the shell would find it. */
export function onPath(bin: string, env: NodeJS.ProcessEnv = process.env, exists = (p: string) => fs.existsSync(p)): boolean {
  if (bin.includes('/')) return exists(bin)
  return (env.PATH ?? '').split(path.delimiter).some((dir) => dir && exists(path.join(dir, bin)))
}

/** Every agent that can be asked right now: built-ins that are installed, then yours. */
export function availableAgents(userAgents: PlanAgent[], installed: (bin: string) => boolean = (b) => onPath(b)): PlanAgent[] {
  return [...BUILTIN_AGENTS.filter((a) => installed(a.command[0]!)), ...userAgents.filter((a) => installed(a.command[0]!))]
}

export function loadUserAgents(userData: string): PlanAgent[] {
  try {
    return parseUserAgents(JSON.parse(fs.readFileSync(path.join(userData, PLAN_AGENTS_FILE), 'utf8')))
  } catch {
    return []
  }
}

/** The argv for one question. */
export function agentArgv(agent: PlanAgent, prompt: string, outputFile: string): { bin: string; args: string[] } {
  const filled = agent.command.map((a) => (a === '{prompt}' ? prompt : a === '{output}' ? outputFile : a))
  return { bin: filled[0]!, args: filled.slice(1) }
}

export type RunCommand = (bin: string, args: string[], opts: { cwd: string; timeoutMs: number }) => Promise<{ stdout: string; failed: Error | null }>

/**
 * Runs with stdin closed: an agent started with an open pipe there may wait
 * for more input that never comes (Codex printed "Reading additional input
 * from stdin..." and sat until it was killed).
 */
const runCommand: RunCommand = (bin, args, opts) =>
  new Promise((resolve) => {
    let stdout = ''
    let settled = false
    const done = (failed: Error | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, failed })
    }
    const child = spawn(bin, args, { cwd: opts.cwd, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] })
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < 4 * 1024 * 1024) stdout += chunk.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      done(new Error('timed out'))
    }, opts.timeoutMs)
    child.on('error', (err) => done(err))
    child.on('close', (code) => done(code === 0 ? null : new Error(`${bin} exited with ${code}`)))
  })

/**
 * Ask `agent` one question and return its answer as text. It runs in an empty
 * temporary folder, so an agent that reads its working directory sees nothing
 * of yours, and the folder is removed afterwards.
 */
export async function askAgent(agent: PlanAgent, prompt: string, run: RunCommand = runCommand, timeoutMs = PLAN_AGENT_TIMEOUT_MS): Promise<string> {
  if (prompt.length > PLAN_PROMPT_MAX) throw new Error('This conversation is too long to send; start a new plan.')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screenpolish-plan-'))
  try {
    const outputFile = path.join(dir, 'answer.txt')
    const { bin, args } = agentArgv(agent, prompt, outputFile)
    const { stdout, failed } = await run(bin, args, { cwd: dir, timeoutMs })
    const written = agent.command.includes('{output}') && fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : ''
    const answer = (written || stdout).trim()
    if (answer) return answer
    if (failed && /timed out|ETIMEDOUT|SIGTERM/.test(failed.message)) throw new Error(`${agent.name} did not answer within ${Math.round(timeoutMs / 1000)} s.`)
    if (failed && (failed as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`${agent.name} is not installed (${bin} was not found).`)
    throw new Error(`${agent.name} gave no answer${failed ? `: ${failed.message.split('\n')[0]}` : '.'}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
