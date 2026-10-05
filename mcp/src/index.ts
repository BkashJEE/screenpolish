#!/usr/bin/env node
/**
 * ScreenPolish as an MCP server.
 *
 * Lets an agent film its own work: start a recording, do something worth
 * showing, stop, and get an MP4 back — with the zooms, drawn cursor and
 * background the app adds on its own.
 *
 * stdio, because ScreenPolish records the machine the agent is running on.
 * There is nothing useful to say to a copy of it somewhere else.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { DEFAULT_TIMEOUT_MS, LONG_TIMEOUT_MS, PolishError, runPolish } from './polish.js'

const server = new McpServer({ name: 'screenpolish-mcp-server', version: '0.1.0' })

/** Every tool answers the same way: the CLI's JSON, both as text and structured. */
async function reply(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const result = await runPolish(args, timeoutMs)
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      structuredContent: result
    }
  } catch (err) {
    const message = err instanceof PolishError ? err.message : String(err)
    return { content: [{ type: 'text' as const, text: message }], isError: true }
  }
}

const exportKind = z.enum(['mp4', 'gif']).describe('mp4 for anything you will post; gif only for a short silent loop.')

const startOptions = {
  display: z
    .union([z.literal('primary'), z.number().int().min(1)])
    .optional()
    .describe('Which screen: "primary", or a 1-based index. Defaults to primary.'),
  region: z
    .string()
    .regex(/^\d+,\d+,\d+,\d+$/)
    .optional()
    .describe('Record part of the screen: "X,Y,WIDTH,HEIGHT" in physical pixels from that display\'s top-left.'),
  mic: z.boolean().optional().describe('Record the microphone. Off by default, so narration is silent unless asked for.'),
  system: z.boolean().optional().describe('Record system audio. On by default.'),
  webcam: z.boolean().optional().describe('Record the webcam into a corner bubble. Off by default.'),
  fps: z.union([z.literal(30), z.literal(60)]).optional().describe('Capture frame rate. 30 by default; 60 for motion.')
}

function startArgs(o: {
  display?: 'primary' | number
  region?: string
  mic?: boolean
  system?: boolean
  webcam?: boolean
  fps?: 30 | 60
}): string[] {
  const args: string[] = []
  if (o.display !== undefined) args.push('--display', String(o.display))
  if (o.region) args.push('--region', o.region)
  if (o.mic) args.push('--mic')
  if (o.system === false) args.push('--no-system')
  if (o.webcam) args.push('--webcam')
  if (o.fps !== undefined) args.push('--fps', String(o.fps))
  return args
}

function exportArgs(o: { export?: 'mp4' | 'gif'; name?: string }): string[] {
  const args: string[] = []
  if (o.export) args.push('--export', o.export)
  if (o.name) args.push('--name', o.name)
  return args
}

server.registerTool(
  'screenpolish_status',
  {
    title: 'ScreenPolish status',
    description:
      'Whether ScreenPolish is idle, counting down, recording, or finishing a take, and the folder of the last one. ' +
      'Check this before starting a recording, and to find out whether one is still running.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async () => reply(['status'])
)

server.registerTool(
  'screenpolish_list_recordings',
  {
    title: 'List recordings',
    description:
      'Every take in the recordings folder, newest first, with its folder, title, duration, size and a thumbnail. ' +
      'Use the folder from here as the argument to screenpolish_export or screenpolish_open_editor.',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async () => reply(['list'])
)

server.registerTool(
  'screenpolish_start_recording',
  {
    title: 'Start recording',
    description:
      'Begin recording the screen. Returns once capture has started; it keeps running until screenpolish_stop_recording. ' +
      'On Hyprland the system cursor is left out of the video and the app draws its own, so the pointer style is chosen later. ' +
      'Fails if a recording is already running — check screenpolish_status first.',
    inputSchema: startOptions,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => reply(['record', 'start', ...startArgs(args)])
)

server.registerTool(
  'screenpolish_stop_recording',
  {
    title: 'Stop recording',
    description:
      'Stop the running recording and finalize it. Optionally export in the same step, which is usually what you want. ' +
      'Finalizing remuxes the capture and writes the event log, so this can take a while on a long take.',
    inputSchema: {
      export: exportKind.optional().describe('Export immediately after stopping. Omit to just save the take.'),
      name: z.string().optional().describe('Name for the exported file. Ignored unless export is set.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async (args) => reply(['record', 'stop', ...exportArgs(args)], LONG_TIMEOUT_MS)
)

server.registerTool(
  'screenpolish_clip',
  {
    title: 'Record a clip of fixed length',
    description:
      'Record for a set number of seconds, then stop on its own. The one call to use when you know how long the thing ' +
      'you want to show takes — it avoids leaving a recording running if a later step fails.',
    inputSchema: {
      seconds: z.number().positive().max(600).describe('How long to record, in seconds.'),
      ...startOptions,
      export: exportKind.optional().describe('Export as soon as the clip ends.'),
      name: z.string().optional().describe('Name for the exported file. Ignored unless export is set.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async ({ seconds, export: kind, name, ...start }) =>
    reply(['clip', '--seconds', String(seconds), ...startArgs(start), ...exportArgs({ export: kind, name })], LONG_TIMEOUT_MS)
)

server.registerTool(
  'screenpolish_export',
  {
    title: 'Export a recording',
    description:
      'Render an existing take to MP4 or GIF, applying its saved edit: click zooms, the drawn cursor, background, ' +
      'speed regions, cuts and music. Every frame is re-rendered, so a long take takes minutes. ' +
      'Returns the path of the finished file.',
    inputSchema: {
      folder: z
        .string()
        .describe('The take to export: a folder from screenpolish_list_recordings, absolute or relative to the recordings root.'),
      kind: exportKind.optional().describe('Defaults to mp4.'),
      name: z.string().optional().describe('Name for the exported file. Defaults to the take\'s title.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async ({ folder, kind, name }) => {
    const args = ['export', folder]
    if (kind) args.push('--kind', kind)
    if (name) args.push('--name', name)
    return reply(args, LONG_TIMEOUT_MS)
  }
)

server.registerTool(
  'screenpolish_replay_start',
  {
    title: 'Start holding a replay buffer',
    description:
      'Hold the last N seconds of the screen in memory, writing nothing to disk until asked. ' +
      'Use this when you do not know in advance which moment will be worth keeping — start the buffer, ' +
      'work, and call screenpolish_replay_save once something happens. Linux only, and it cannot run at ' +
      'the same time as an ordinary recording.',
    inputSchema: {
      seconds: z.number().int().min(5).max(600).describe('Seconds of history to hold. Longer costs memory.'),
      display: z
        .union([z.literal('primary'), z.number().int().min(1)])
        .optional()
        .describe('Which screen: "primary", or a 1-based index.'),
      fps: z.union([z.literal(30), z.literal(60)]).optional().describe('Capture frame rate. 30 by default.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async ({ seconds, display, fps }) => {
    const args = ['replay', 'start', '--seconds', String(seconds)]
    if (display !== undefined) args.push('--display', String(display))
    if (fps !== undefined) args.push('--fps', String(fps))
    return reply(args)
  }
)

server.registerTool(
  'screenpolish_replay_save',
  {
    title: 'Save the replay buffer',
    description:
      'Write what the buffer is holding to a clip, and keep holding. Returns the path of the clip. ' +
      'Call this straight after the thing worth keeping happened — the buffer only holds the last N seconds.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  async () => reply(['replay', 'save'], 90_000)
)

server.registerTool(
  'screenpolish_replay_stop',
  {
    title: 'Stop holding a replay buffer',
    description: 'Stop holding history and free the memory. Anything not already saved is discarded.',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async () => reply(['replay', 'stop'])
)

server.registerTool(
  'screenpolish_open_editor',
  {
    title: 'Open the editor',
    description:
      'Show a take in the ScreenPolish window so a person can look at it or change the edit. ' +
      'Use this to hand work back to someone, not to do anything yourself — nothing is returned about what they then do.',
    inputSchema: {
      folder: z.string().optional().describe('The take to open. Omit to just bring the window up.')
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  async ({ folder }) => reply(folder ? ['open', folder] : ['open'])
)

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error('[screenpolish-mcp] failed to start:', err)
  process.exit(1)
})
