# AI Agents Guide

This project provides real-time visual feedback for opencode sessions.

## Project overview

- **`.opencode/plugins/track.js`** — opencode plugin that hooks into tool
  lifecycle events and sends them to a local HTTP server.
- **`tracker/server.js`** — standalone Node.js server that receives plugin
  events via POST and pushes them to a browser via SSE. Serves a pixel-art
  HTML dashboard.

## Architecture

```
opcode session
    │
    ▼
.opencode/plugins/track.js   (plugin hooks tool.execute.before/after & session events)
    │  POST /event
    ▼
tracker/server.js            (port 3001 — state machine + SSE broadcaster)
    │  SSE /stream
    ▼
Browser HTML page            (pixel-art sprites + background color per state)
```

## Adding new states

1. Add a new entry to the `sprites` object in `tracker/server.js`. Each sprite
   requires `fps` (frames per second) and `frames` (array of string arrays,
   one sub-array per frame).
2. Add the mapping in `mapState()`.
3. Optionally add a CSS class selector for the background color.
4. If the event comes from a new hook type, add it in
   `.opencode/plugins/track.js`.

## Sprites format

Each sprite is an object with:
- **`fps`** — animation speed in frames per second
- **`frames`** — array of frames, where each frame is a `string[]` of 11 rows,
  12 characters wide. Each character maps to a color in the `pal` object.

The client maintains a **state queue** with a minimum display time of 400ms
per state (`MIN_VISIBLE_MS`), so rapid tool events don't flash by invisibly.
A `requestAnimationFrame` loop cycles through frames of the current sprite.

## Running locally

```bash
node tracker/server.js
```

The server listens on port 3001. No build step, no dependencies beyond
Node.js built-ins.
