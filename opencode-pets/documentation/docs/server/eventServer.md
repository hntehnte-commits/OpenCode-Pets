# Module: `src/server/eventServer.js`

**File:** `src/server/eventServer.js`
**Status:** Updated for v2.0 (session tracking)

## Purpose

Embedded HTTP/SSE server inside the VSCode extension process. Receives events
from the opencode plugin (`dashboard.js` or `track.js`) via `POST /event`,
maintains per-agent state organised by session, broadcasts to Webview clients
via SSE (`GET /stream`), and provides a session listing endpoint so the panel
can offer a session selection QuickPick.

## Data flow

```
.opencode/plugins/dashboard.js (or track.js)
    │  POST /event  {"type":"tool.start","data":{...,"agent":"explore"},"session_id":"<uuid>"}
    ▼
EventServer (port 3001–3010, auto-discovered)
    │
    ├── Extract session_id (or "default" if absent)
    │
    ├── _stateFromEvent(event) → { state, agent, tool, detail }
    │
    ├── _updateSession(sessionId, agentState, terminalLabel)
    │     └── Track in _sessions: Map<sessionId, SessionState>
    │
    ├── _broadcast({ ...agentState, sessionId }) → SSE data to clients
    │     └── Clients filtered by ?session=<id> if set
    │
    └── _notifyCallbacks(state) → petsPanel.ts onEvent callback
          └── postMessage to Webview (fallback path)
    │
    ▼
Webview clients (via SSE /stream or postMessage):
    main.js → handleEventData → processEvent → per-agent queue
```

## Server endpoints

| Method | Path | Purpose | v2.0 Change |
|--------|------|---------|-------------|
| `POST` | `/event` | Receive JSON event from opencode plugin | Extracts `session_id` from body |
| `GET` | `/stream` | SSE endpoint — pushes state to Webview | Accepts `?session=<id>` filter |
| `GET` | `/sessions` | **NEW** — list active sessions | Added in v2.0 |
| `GET` | `/` (or any other) | Health check — returns "OpenCode Pets Event Server" | Unchanged |

### `POST /event` — Request format (v2.0)

```json
{
  "type": "tool.start" | "tool.end" | "plugin.loaded" | "session",
  "data": {
    "tool": "read" | "write" | "edit" | "bash" | "grep" | "glob",
    "agent": "explore" | "ssd-planner" | ... ,
    "detail": "Optional description",
    "args": {},
    "type": "session.created" | "session.idle" | "session.error" | "session.stopped"
  },
  "time": 1718000000000,
  "session_id": "<uuid v4>",       // NEW: identifies the source terminal
  "terminal": "terminal-label"      // NEW: human-readable terminal name
}
```

If `session_id` is absent (e.g. from old `track.js`), the event is routed to the
`"default"` session for backward compatibility.

### `GET /stream` — SSE output format

```
data: {"current":{"state":"write","agent":"ssd-spec-writer","tool":"edit","detail":"Writing..."},"sessionId":"<uuid>"}\n\n
```

When `?session=<id>` is provided, the server only pushes events whose
`sessionId` matches the filter. Events without a `sessionId` are always passed
through.

### `GET /sessions` — Response format (NEW in v2.0)

```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "label": "opencode-terminal-1",
      "lastSeen": 1718000000000,
      "createdAt": 1717999000000,
      "agentCount": 3
    }
  ]
}
```

## Key exports

### `class EventServer`

#### `constructor()`
- Initialises:
  - `_server: null` — HTTP server instance
  - `_clients: Set<{ res, filterSessionId }>` — SSE client connections
  - `_current: { state: 'idle', agent: null, tool: '', detail: '' }` — latest state (legacy)
  - `_sessions: Map<sessionId, SessionState>` — **NEW**: per-session state
  - `_callbacks: Function[]` — registered event notification callbacks
  - `_port: 3001` — configured port
  - `_cleanupInterval: null` — **NEW**: periodic stale session cleanup timer

#### `start(port: number): Promise<number>`
- **Parameters:** `port: number` (default 3001)
- **Returns:** Promise resolving with the actual listening port
- **Behaviour:**
  - Creates HTTP server with route handlers for `/event`, `/stream`, `/sessions`
  - If port is in use (`EADDRINUSE`), tries `port+1` up to 3010
  - After listening, writes port to `~/.opencode/dashboard.json` via `writePortFile()`
  - Starts periodic session cleanup interval (every 60s)

#### `stop(): void`
- Stops cleanup interval
- Closes all SSE client connections
- Clears the clients Set
- Closes the HTTP server
- Removes the port file via `removePortFile()`

#### `onEvent(callback: Function): void`
- Registers a callback that receives the current state object on every incoming event
- Used by `petsPanel.ts` for forwarding events to Webview via `postMessage`

#### `getCurrentState(): object`
- Returns the current state `{ state, agent, tool, detail }` (legacy — reflects most
  recent event regardless of session)

#### `getPort(): number`
- Returns the actual listening port

#### `getSessions(): SessionSummary[]`
- **NEW in v2.0.** Returns active sessions (those with events in the last 5 minutes).
- Each entry includes `id`, `label`, `lastSeen`, `createdAt`, `agentCount`.

## Private methods

### `_updateSession(sessionId, agentState, terminalLabel): void`
- Creates a new session entry if one does not exist for `sessionId`
- Updates `lastSeen` timestamp and per-agent state within the session

### `_getSessionState(sessionId): object`
- Returns the most recently updated agent state within a session
- Falls back to `_current` if the session does not exist

### `_startCleanup()` / `_stopCleanup()`
- `_startCleanup` begins a `setInterval` that runs every 60 seconds, removing
  sessions where `now - session.lastSeen > 5 minutes`
- `_stopCleanup` clears the interval

### `_stateFromEvent(event): object`
Maps incoming event types to state objects (unchanged from v1.0).

### `_broadcast(state): void`
- Writes SSE-formatted data to connected clients
- Respects per-client `filterSessionId` — events that don't match the client's
  session filter are skipped

### `_notifyCallbacks(state): void`
- Invokes all registered callbacks with the current state

## Internal state shapes

### `SessionState` (per-session entry in `_sessions` Map)

```javascript
{
  id: string,              // UUID v4 or "default"
  agents: {                 // Map<agentId, AgentState>
    [agentId]: {
      state: string,        // e.g. "read", "write", "idle"
      agent: string,        // e.g. "explore"
      tool: string,         // e.g. "read"
      detail: string,       // e.g. "explore running read"
      time: number,         // Epoch ms of last event
    }
  },
  lastSeen: number,         // Epoch ms of most recent event
  createdAt: number,        // Epoch ms of session creation
  label: string,            // Human-readable terminal label (if provided)
}
```

## Dependencies
- `http` — Node.js built-in HTTP module
- `../utils/portFile` — `writePortFile`, `removePortFile` (port discovery)

## Usage example

```javascript
const { EventServer } = require('./eventServer')

const server = new EventServer()
server.start(3001).then(port => {
  console.log(`Server listening on port ${port}`)
})

server.onEvent(state => {
  console.log('State update:', state)
})

// v2.0: list active sessions
const sessions = server.getSessions()
console.log('Active sessions:', sessions.length)
```

## Changes in v2.0

| Change | Description |
|--------|-------------|
| `_sessions` Map | Replaces single `_current` as primary state store; keyed by `session_id` |
| `GET /sessions` | New endpoint returning active session list for QuickPick |
| `POST /event` — `session_id` | Extracted from request body; routed to per-session state |
| `GET /stream?session=<id>` | Client-side filtering: only events matching the filter are pushed |
| Periodic cleanup | `setInterval` every 60s removes sessions idle > 5 minutes |
| Port file integration | Server writes `~/.opencode/dashboard.json` on `start()`; removes on `stop()` |
| Client object shape | `_clients` now stores `{ res, filterSessionId }` instead of raw responses |

## Backward Compatibility

- Events without `session_id` (e.g. from old `track.js`) are routed to the
  `"default"` session — behaviour is identical to v1.0
- `_current` is still updated on every event, so legacy `getCurrentState()` calls
  continue to work
- The multi-agents standalone tracker (`tracker/server.js`) is unaffected

## Acceptance Criteria covered

| ID | Description | Status |
|----|-------------|--------|
| AC1 | Extension writes `~/.opencode/dashboard.json` with correct port on server start | v2.0 |
| AC1b | Extension deletes port file on deactivation | v2.0 |
| AC4 | Events with different session_ids create separate session states | v2.0 |
| AC4b | Server `/sessions` endpoint returns active sessions list | v2.0 |
| AC7 | Events without `session_id` (old track.js) route to "default" session | v2.0 |

## Reference
- [Implementation Plan](../current/implementation-plan.md) — Phase 1: Session Identity
- [Specification](../../spec.md) — Section 4.3
