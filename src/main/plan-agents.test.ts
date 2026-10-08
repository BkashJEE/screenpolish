import * as fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILTIN_AGENTS, PLAN_PROMPT_MAX, agentArgv, askAgent, availableAgents, onPath, parseUserAgents, type RunCommand } from './plan-agents'

describe('parseUserAgents', () => {
  it('keeps agents that name a command with a prompt slot', () => {
    expect(parseUserAgents([{ name: 'Ada', command: ['agent', '-p', 'ada', '{prompt}'] }])).toEqual([
      { id: 'custom-0-ada', name: 'Ada', command: ['agent', '-p', 'ada', '{prompt}'] }
    ])
  })

  it('skips anything it cannot run safely', () => {
    expect(parseUserAgents('agents')).toEqual([])
    expect(
      parseUserAgents([
        { name: '', command: ['a', '{prompt}'] },
        { name: 'No slot', command: ['a', 'b'] },
        { name: 'A string', command: 'a {prompt}' },
        { name: 'Empty bin', command: ['', '{prompt}'] },
        { name: 'Numbers', command: ['a', 1, '{prompt}'] },
        { name: 'Huge', command: Array.from({ length: 40 }, () => '{prompt}') }
      ])
    ).toEqual([])
  })
})

describe('availableAgents', () => {
  it('lists installed built-ins first, then yours, skipping what is not installed', () => {
    const mine = parseUserAgents([{ name: 'Ada', command: ['agent', '{prompt}'] }, { name: 'Gone', command: ['missing', '{prompt}'] }])
    const installed = (bin: string) => bin === 'codex' || bin === 'agent'
    expect(availableAgents(mine, installed).map((a) => a.name)).toEqual(['Codex', 'Ada'])
  })

  it('finds commands on PATH the way a shell would', () => {
    const env = { PATH: '/usr/bin:/opt/bin' }
    expect(onPath('codex', env, (p) => p === '/opt/bin/codex')).toBe(true)
    expect(onPath('codex', env, () => false)).toBe(false)
    expect(onPath('/abs/agent', env, (p) => p === '/abs/agent')).toBe(true)
  })
})

describe('agentArgv', () => {
  it('puts the question and the answer file where the command says, as single arguments', () => {
    const codex = BUILTIN_AGENTS.find((a) => a.id === 'codex')!
    const prompt = 'plan "this"; rm -rf ~ $(whoami)'
    const { bin, args } = agentArgv(codex, prompt, '/tmp/x/answer.txt')
    expect(bin).toBe('codex')
    expect(args).toContain(prompt)
    expect(args[args.indexOf('-o') + 1]).toBe('/tmp/x/answer.txt')
    expect(args.filter((a) => a === prompt)).toHaveLength(1)
  })

  it('switches tools off in every built-in', () => {
    const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude-code')!.command
    expect(claude[claude.indexOf('--tools') + 1]).toBe('')
    const codex = BUILTIN_AGENTS.find((a) => a.id === 'codex')!.command
    expect(codex[codex.indexOf('--sandbox') + 1]).toBe('read-only')
  })
})

describe('askAgent', () => {
  const agent = { id: 'a', name: 'Ada', command: ['agent', '{prompt}'] }

  it('returns the answer from stdout, run in an empty folder that is removed afterwards', async () => {
    let cwd = ''
    const run: RunCommand = async (_bin, _args, opts) => {
      cwd = opts.cwd
      expect(fs.readdirSync(opts.cwd)).toEqual([])
      return { stdout: '  Here is a plan.\n', failed: null }
    }
    expect(await askAgent(agent, 'q', run)).toBe('Here is a plan.')
    expect(fs.existsSync(cwd)).toBe(false)
  })

  it('reads the answer file when the agent writes one', async () => {
    const withFile = { ...agent, command: ['agent', '-o', '{output}', '{prompt}'] }
    const run: RunCommand = async (_bin, args) => {
      fs.writeFileSync(args[args.indexOf('-o') + 1]!, 'From the file')
      return { stdout: 'progress noise', failed: null }
    }
    expect(await askAgent(withFile, 'q', run)).toBe('From the file')
  })

  it('says what went wrong when there is no answer', async () => {
    const timedOut: RunCommand = async () => ({ stdout: '', failed: new Error('Command failed: timed out') })
    await expect(askAgent(agent, 'q', timedOut, 1000)).rejects.toThrow('Ada did not answer within 1 s.')
    const missing: RunCommand = async () => ({ stdout: '', failed: Object.assign(new Error('spawn agent ENOENT'), { code: 'ENOENT' }) })
    await expect(askAgent(agent, 'q', missing)).rejects.toThrow('Ada is not installed')
    await expect(askAgent(agent, 'x'.repeat(PLAN_PROMPT_MAX + 1), missing)).rejects.toThrow('too long')
  })
})
