# multi-agents

A visual real-time tracker for [opencode](https://opencode.ai) sessions.

## Project Structure

- **`tracker/`** — Node.js HTTP/SSE server that receives opencode plugin events
  and serves a live dashboard with pixel-art feedback.
- **`.opencode/`** — opencode project configuration and plugin dependencies.

## Getting Started

```bash
cd tracker
node server.js
```

Open `http://localhost:3001` in a browser. The page displays a pixel-art
character whose appearance and background color change based on what opencode
is doing (idle, thinking, writing, reading, running bash commands, or errors).

## How It Works

1. An opencode plugin sends POST requests to `/event` with JSON payloads
   describing lifecycle events (`plugin.loaded`, `tool.start`, `tool.end`,
   `session`).
2. The server maintains the current state in memory and broadcasts it to all
   connected SSE clients (`/stream`).
3. The browser client maps each state to a pixel-art sprite and updates the
   display in real time.

## Event API

`POST /event` — Receive an event from opencode.

```json
{ "type": "tool.start", "data": { "tool": "read", "args": { ... } } }
```

`GET /stream` — SSE endpoint; pushes `{ current: { state, tool, detail } }`.

`GET /` — Serves the HTML dashboard.
