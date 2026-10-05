# ScreenPolish MCP server

Lets an agent film its own work. It starts a recording, you do something worth
showing, it stops and gets an MP4 back — with the click zooms, drawn cursor and
background ScreenPolish adds on its own.

It wraps the `screenpolish` CLI, which already prints one JSON object per
command, so this is a thin and boring layer by design.

## Tools

| Tool | What it does |
|---|---|
| `screenpolish_status` | Idle, counting down, recording, or finishing — and the last take's folder |
| `screenpolish_list_recordings` | Every take, newest first, with duration, size and thumbnail |
| `screenpolish_start_recording` | Start capture (screen, display, or a region) |
| `screenpolish_stop_recording` | Stop and finalize, optionally exporting in the same step |
| `screenpolish_clip` | Record for a fixed number of seconds, then stop on its own |
| `screenpolish_export` | Render a take to MP4 or GIF, applying its saved edit |
| `screenpolish_open_editor` | Show a take in the window, to hand work back to a person |

`screenpolish_status` and `screenpolish_list_recordings` are read-only. Nothing
here deletes a recording, and `quit` is deliberately not exposed — an agent has
no reason to shut the app down on somebody.

## Install

```bash
cd mcp
npm install
npm run build
```

The server finds the binary in this order: `SCREENPOLISH_BIN`, then
`~/.local/bin/screenpolish`, then `screenpolish` on `PATH`.

## Connect it

Any client that runs a local stdio MCP server takes the same shape:

```json
{
  "mcpServers": {
    "screenpolish": {
      "command": "node",
      "args": ["/absolute/path/to/screenpolish/mcp/dist/index.js"]
    }
  }
}
```

**Claude Desktop** — add that to `claude_desktop_config.json`
(`~/.config/Claude/` on Linux, `~/Library/Application Support/Claude/` on macOS,
`%APPDATA%\Claude\` on Windows) and restart.

**Claude Code**

```bash
claude mcp add screenpolish -- node /absolute/path/to/screenpolish/mcp/dist/index.js
```

**Other clients** (ChatGPT desktop, Hermes agents, anything else) — whatever
their config file is, it wants the same `command` and `args`. Support for local
MCP servers differs between clients and versions, so check what yours offers.

To see the tools without wiring up a client at all:

```bash
npm run inspect
```

## Why stdio and not HTTP

ScreenPolish records the machine it runs on. There is nothing useful to say to
a copy of it somewhere else, so there is no reason to put it on a port.

## Things worth knowing before you automate it

**Recording is exclusive.** One take at a time. Call `screenpolish_status`
before starting, or handle the failure.

**Stopping and exporting are slow.** Finalizing remuxes the capture and writes
the event log; an export re-renders every frame. Both get a 20 minute timeout
here, and a long 4K take can use a fair slice of it.

**The microphone is off unless asked for.** `mic: true` if you want narration.
System audio is on by default.

**Prefer `screenpolish_clip` when you know the length.** It stops itself, so a
failure later in your sequence cannot leave a recording running forever.

**On Hyprland the system cursor is left out of the capture** and the app draws
its own at export. That is why pointer style, size and click effects are chosen
after the fact rather than before.
