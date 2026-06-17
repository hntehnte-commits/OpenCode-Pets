# Module: `.opencode/plugins/dashboard.js`

**File:** `.opencode/plugins/dashboard.js`
**Status:** Updated for v2.0 (port discovery + session identity)

## Purpose

OpenCode plugin that hooks into tool and session lifecycle events and sends them
to the embedded event server via HTTP POST. This is the bridge between the
opencode session and the OpenCode Pets extension's dashboard.

In v2.0 the plugin dynamically discovers the extension's server port (instead of
hardcoding port 3001) and includes a unique `session_id` in every event so the
server can distinguish events from different terminals.

## Data flow

```
opencode session (user prompt, tool execution, etc.)
    │
    ▼
DashboardPlugin factory:
    ├── generateUUID() → SESSION_ID (unique per terminal)
    ├── discoverServerUrl() → http://localhost:<port>/event
    │     ├── 1. Read ~/.opencode/dashboard.json
    │     ├── 2. Scan ports 3001–3010
    │     └── 3. Fall back to default (3001)
    │
    ▼
Plugin hooks:
    ├── tool.execute.before  → POST /event { type: 'tool.start', session_id, ... }
    ├── tool.execute.after   → POST /event { type: 'tool.end', session_id, ... }
    ├── event (session)      → POST /event { type: 'session', session_id, ... }
    └── stop                 → POST /event { type: 'session', data: { type: 'session.stopped' }, session_id }
    │
    ▼
EventServer (discovered port)
    └── _updateSession → broadcast to Webview
```

## Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_SERVER` | `'http://localhost:3001/event'` | Fallback URL when discovery fails |
| `MAX_RETRIES` | `5` | Maximum POST retry attempts |
| `RETRY_BASE_MS` | `500` | Initial backoff delay (doubles each attempt) |
| `SESSION_ID` | Generated UUID v4 | Unique identifier for this terminal session |
| `TERMINAL_LABEL` | `process.env.OPENCODE_TERMINAL_TITLE` | Optional human-readable terminal name |

### `TOOL_AGENT_MAP` — Tool-to-agent mapping (unchanged)

| Tool | Agent |
|------|-------|
| `read` | `explore` |
| `write` | `ssd-implementer` |
| `edit` | `ssd-implementer` |
| `bash` | `general` |
| `grep` | `explore` |
| `glob` | `explore` |

## Key exports

### `DashboardPlugin` (async function factory)

Returns a plugin object with lifecycle hooks (same structure as v1.0, but each
`send()` call now includes `session_id` and `terminal` fields).

#### `plugin.loaded` (sent during factory execution)
- **Type:** `'plugin.loaded'`
- **Agent:** `'ssd-orchestrator'`
- **v2.0 addition:** Payload includes `session_id` and `terminal`

#### `'tool.execute.before': async (input, output) => { ... }`
- **Sends:** `POST /event` with `type: 'tool.start'`
- **v2.0 addition:** Payload includes `session_id` and `terminal`

#### `'tool.execute.after': async (input, result) => { ... }`
- **Sends:** `POST /event` with `type: 'tool.end'`
- **v2.0 addition:** Payload includes `session_id` and `terminal`

#### `event: async ({ event }) => { ... }`
- **Sends:** `POST /event` with `type: 'session'`
- **Filters:** Only processes `session.created`, `session.idle`, `session.error`
- **v2.0 addition:** Payload includes `session_id` and `terminal`

#### `stop: async () => { ... }`
- **Sends:** `POST /event` with `type: 'session'`, `data.type: 'session.stopped'`
- **v2.0 addition:** Payload includes `session_id` and `terminal`

## Internal helpers

### `generateUUID(): string`
- Generates a RFC 4122 version 4 UUID using the `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`
  pattern with Math.random()
- Called once at module load time; the result is stored in `SESSION_ID`

### `readPortFromFile(): Promise<number | null>`
- Attempts to read `~/.opencode/dashboard.json` via dynamic `import()` with JSON
  assertion
- Returns the `port` field if present and numeric, or `null` if the file is missing,
  corrupt, or dynamic import is unsupported

### `scanPorts(): Promise<number | null>`
- Iterates ports 3001–3010, sending a `GET /` with a 300ms timeout
- Returns the first port that responds with an HTTP OK status
- Returns `null` if no port responds

### `discoverServerUrl(): Promise<string>`
- Three-tier discovery:
  1. Read port from `~/.opencode/dashboard.json`
  2. Scan ports 3001–3010
  3. Fall back to `http://localhost:3001/event`
- Called on first `send()` and on each retry attempt

### `async send(type, data)`
- **Parameters:**
  - `type` — event type (`'tool.start'`, `'tool.end'`, `'session'`, `'plugin.loaded'`)
  - `data` — event payload object
- **Behaviour:**
  - Discovers server URL if not yet known
  - Sends HTTP POST with JSON body including `session_id` and `terminal`
  - Retries up to 5 times with exponential backoff (500ms → 1s → 2s → 4s → 8s)
  - On each retry, re-discovers the server URL in case the port changed
  - Silently drops the event after all retries are exhausted

## Event payload format (v2.0)

```json
{
  "type": "tool.start",
  "data": {
    "agent": "explore",
    "tool": "read",
    "detail": "explore running read"
  },
  "time": 1718000000000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "terminal": "opencode-terminal-1"
}
```

## Dependencies
- `fetch` — available in opencode plugin runtime (built-in)
- `AbortSignal.timeout()` — modern Node.js runtime (>= 18)
- Dynamic `import()` with JSON assertion — for port file reading

## Usage example

```javascript
// In opencode configuration, register the plugin:
// .opencode/plugins/dashboard.js

export const plugin = await DashboardPlugin()
// Plugin automatically discovers port, generates session_id,
// and hooks into tool lifecycle
```

## State management

The plugin is stateless between events. The only persistent state is:
- `SESSION_ID` — generated once at module load, lives for the life of the plugin
- `_discoveredUrl` — cached server URL, cleared on retry failures

## Changes in v2.0

| Change | Description |
|--------|-------------|
| Port discovery | Replaces hardcoded `SERVER` constant with `discoverServerUrl()` |
| Session identity | `generateUUID()` creates a unique ID per plugin instance |
| `session_id` field | Every POST payload now includes `session_id` |
| `terminal` field | Every POST payload includes `TERMINAL_LABEL` from env var |
| Exponential backoff | Retries POST on failure (500ms → 1s → 2s → 4s → 8s, max 5) |
| Port scan fallback | If file-based discovery fails, scans ports 3001–3010 |
| Dynamic URL re-discovery | On each retry, re-runs `discoverServerUrl()` to catch port changes |

## Backward Compatibility

- If `~/.opencode/dashboard.json` is absent and port scan fails, the plugin
  falls back to `http://localhost:3001/event` — the same URL as v1.0
- The event payload format is backward compatible: the server ignores unknown
  fields, so old `track.js` events (without `session_id`) continue to work
- The plugin factory signature is unchanged — existing opencode configurations
  that `await DashboardPlugin()` continue to work

## Acceptance Criteria covered

| ID | Description | Status |
|----|-------------|--------|
| AC2 | Plugin reads port from file, falls back to 3001 if absent | v2.0 |
| AC2b | Plugin retries with backoff when port file missing | v2.0 |
| AC3 | Plugin generates unique UUID v4 session_id on each load | v2.0 |
| AC3b | All events from a plugin instance include `session_id` | v2.0 |
| AC8 | Plugin works when loaded from user project's `.opencode/plugins/` directory | v2.0 |

## Reference
- [Implementation Plan](../current/implementation-plan.md) — Phase 0: Port Discovery
- [Specification](../../spec.md) — Section 4.4
