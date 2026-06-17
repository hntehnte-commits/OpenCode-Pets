# OpenCode Pets — VSCode Extension Specification

> **Status:** Draft  
> **Version:** 2.0 (Multi-Terminal + Port Discovery)  
> **Owner:** SDD Spec Writer  
> **Approval:** Required before implementation

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Current Problems](#2-current-problems)
3. [Feature Specifications](#3-feature-specifications)
4. [Technical Architecture](#4-technical-architecture)
5. [Component Specs](#5-component-specs)
6. [Data Flow](#6-data-flow)
7. [API Surface](#7-api-surface)
8. [UI Specifications](#8-ui-specifications)
9. [Acceptance Criteria](#9-acceptance-criteria)
10. [Test Plan](#10-test-plan)
11. [Backward Compatibility](#11-backward-compatibility)
12. [Constraints & Design Decisions](#12-constraints--design-decisions)

---

## 1. Product Overview

### 1.1 Problem Statement

OpenCode sessions involve multiple AI agents that perform different roles. The **OpenCode Pets** extension provides an ambient, glanceable pixel-art dashboard inside VSCode showing agent activity in real-time. However, the current event pipeline has three critical issues:

1. **Port discovery is broken** — The extension starts an HTTP server on port 3001, but if that port is taken, it falls back to 3002, 3003, etc. The opencode plugin (`dashboard.js`) has `SERVER = 'http://localhost:3001/event'` hardcoded — events go to the wrong port when the extension is on a different port.

2. **Plugin location is fragile** — The plugin lives inside the extension's `.opencode/plugins/` directory, but opencode loads plugins from the *user's active project's* `.opencode/plugins/`. Users must manually copy/symlink the plugin.

3. **No session identity** — All opencode terminals post to the same server with no way to distinguish them. If the user has 2+ terminals running opencode, events from all sessions mix together, causing visual chaos.

### 1.2 Vision

This specification addresses all three issues:

- **Port discovery** makes the plugin automatically find the extension's server
- **Session identity** separates events from different opencode terminals
- **Terminal selection** lets users choose which session to watch
- **Multi-terminal tabs** (future) allow simultaneous viewing

### 1.3 Target Users

- OpenCode users with multiple opencode terminal sessions
- Developers using the dashboard extension for the first time (no manual setup)
- Anyone collaborating with multiple opencode instances

### 1.4 User Stories

| ID | Story |
|----|-------|
| US1 | As a user, I want the dashboard to show agents from MY terminal's opencode session, not another terminal's |
| US2 | As a user, I want to switch which terminal's session the dashboard is tracking |
| US3 | As a user, I want the plugin to just work without manually configuring ports |
| US4 | As a user with multiple opencode terminals, I want to see each session's activity |

---

## 2. Current Problems

### 2.1 Port Discovery (P0 — Blocking)

**Current State:**

```
extension.ts                         dashboard.js (plugin)
    │                                      │
    │  eventServer.start(3001)              │  const SERVER = 'http://localhost:3001/event'
    │  (port may become 3002, 3003…)        │  (HARDCODED — always uses 3001)
    │                                      │
    ▼                                      ▼
  Server on port 3002  ←---X---  Plugin POSTs to port 3001
                                       (Events are LOST)
```

**Root Cause:** `dashboard.js` line 1: `const SERVER = 'http://localhost:3001/event'` is hardcoded.

**Impact:** When the configured port (3001) is already in use by another process (e.g., the standalone `multi-agents/tracker/server.js`), the extension falls back to a higher port, but the plugin never learns about it. Events silently disappear into a black hole.

### 2.2 Plugin Location (P1)

**Current State:**
- Plugin file: `opencode-pets/.opencode/plugins/dashboard.js`
- opencode loads plugins from: `$PROJECT/.opencode/plugins/`

The user would need to copy or symlink the plugin from the extension's directory into their project directory. This is a manual step that creates friction.

**Solution:** Ship the plugin at a well-known path and document how the user references it. Either:
- (a) The extension copies the plugin to `~/.opencode/plugins/dashboard.js` on activation
- (b) The user adds a path reference in their opencode config using a documented path

Option (a) is preferred for zero-config experience.

### 2.3 No Session Identity (P0 — Blocking)

**Current State:**

```
Terminal 1: opencode          Terminal 2: opencode
    │                              │
    │  POST /event                  │  POST /event
    │  { type: "tool.start",        │  { type: "tool.start",
    │    data: { tool: "write" } }  │    data: { tool: "bash" } }
    │                              │
    ▼                              ▼
    ┌──────────────────────────────────┐
    │      EventServer (single state)  │
    │                                  │
    │  _current = { state: "write" }   │  ← Overwrites every POST
    │                                  │
    └──────────────────────────────────┘
```

**Root Cause:** `eventServer.js` stores a single `_current` state object. Each new event from *any* terminal overwrites the previous state. There is no concept of session ownership.

**Impact:** With two terminals, events from both mix — agents flicker between states from both sessions.

---

## 3. Feature Specifications

### 3.1 F1 — Port Discovery (P0 - Blocking)

#### 3.1.1 Mechanism

The extension writes its actual listening port to a well-known file. The plugin reads this file to discover where to send events.

**Port File Path:** `~/.opencode/dashboard.json`

**File Format:**
```json
{
  "port": 3002,
  "pid": 12345,
  "startedAt": 1718000000000
}
```

**Extension writes on:**
- Server start success → write `dashboard.json`
- Server port change → rewrite `dashboard.json`
- Extension deactivation → delete `dashboard.json` (cleanup)

**Plugin reads on:**
- Plugin load → read `~/.opencode/dashboard.json`
- Port unreachable (POST fails) → re-read with backoff retry
- If file missing → fall back to `http://localhost:3001/event` (backward compat)

#### 3.1.2 Retry Strategy

When the plugin starts before the extension (race condition):
- Retry reading `dashboard.json` with exponential backoff: 500ms → 1s → 2s → 4s → max 8s
- Max 5 retries before falling back to default port 3001
- On each retry, attempt to POST to the discovered (or default) URL

#### 3.1.3 Cross-Platform Path Resolution

| OS | Path |
|----|------|
| Linux | `~/.opencode/dashboard.json` → `$HOME/.opencode/dashboard.json` |
| macOS | `~/.opencode/dashboard.json` → `$HOME/.opencode/dashboard.json` |
| Windows | `%USERPROFILE%\.opencode\dashboard.json` |

The extension uses `os.homedir()` (Node.js built-in).
The plugin uses `process.env.HOME || process.env.USERPROFILE` (available in opencode plugin runtime).

### 3.2 F2 — Session Identity (P0 - Blocking)

#### 3.2.1 Session ID Generation

Each plugin instance generates a unique session ID on load:

```javascript
function generateSessionId() {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}
```

- Generated once, cached for the lifetime of the plugin instance
- Persisted across reloads? **No** — each plugin load gets a fresh ID (simpler, and stale IDs are cleaned up)

#### 3.2.2 Event Payload Change

**Before (current):**
```json
{
  "type": "tool.start",
  "data": { "tool": "write", "agent": "ssd-spec-writer" },
  "time": 1718000000000
}
```

**After (with session_id):**
```json
{
  "type": "tool.start",
  "data": { "tool": "write", "agent": "ssd-spec-writer" },
  "time": 1718000000000,
  "session_id": "a1b2c3d4-e5f6-4789-abc1-2def34567890"
}
```

#### 3.2.3 Server-Side Session Tracking

`eventServer.js` changes from a single `_current` state to a session map:

```javascript
this._sessions = new Map()
// Key: session_id (string)
// Value: { state, agent, tool, detail, lastSeen, agents: Map<agentId, state> }
```

**Per-Session State:**
```typescript
interface SessionState {
  id: string
  current: AgentState           // Latest global state for this session
  agents: Map<string, AgentState>  // Per-agent states within this session
  lastSeen: number              // Timestamp of last event (epoch ms)
  label?: string                // Optional human label (e.g., terminal title)
}

interface AgentState {
  state: string    // 'idle' | 'happy' | 'error' | 'thinking' | 'write' | 'read' | 'bash'
  agent: string    // agent ID
  tool: string
  detail: string
  time: number
}
```

**Server Routes Update:**
- `POST /event` — now extracts `session_id` from body; stores per-session state
- `GET /stream` — accepts optional query param `?session=<session_id>` to filter events for one session
- `GET /sessions` — NEW: returns list of active sessions (those with events in last 5 minutes)
- `GET /stream?session=<id>` — SSE stream filtered to a single session; if omitted, streams all sessions

**Session Cleanup:**
- Sessions are considered "stale" after 5 minutes of no events
- Stale sessions are removed from the session map
- A periodic cleanup runs every 60 seconds (setInterval in the server)

#### 3.2.4 Plugin Changes

The `dashboard.js` plugin:
1. Generates `session_id` on load
2. Includes `session_id` in every event POST body
3. Reads port from `~/.opencode/dashboard.json` instead of hardcoding

Additionally, the plugin can accept a `terminal` metadata field (populated from opencode's environment if available) to help users identify which terminal a session belongs to:

```javascript
const SESSION_ID = generateSessionId()
const TERMINAL_TITLE = process.env.OPENCODE_TERMINAL_TITLE || ''
```

### 3.3 F3 — Terminal Selection Dialog (P0)

#### 3.3.1 Behavior

When the user opens the dashboard panel (via `opencode-pets.showPanel`), if there are **multiple active sessions** detected:

1. Extension queries the event server for the list of active sessions (`GET /sessions`)
2. If ≥2 sessions are active, VSCode shows a **QuickPick** dialog
3. Each QuickPick item shows:
   - Session ID (truncated, e.g., `a1b2c3d4…`)
   - Terminal title (if available)
   - Last activity time (relative, e.g., "2s ago")
   - Agent activity summary (e.g., "3 agents active")
4. User selects one session to track
5. Panel opens showing only events from the selected session
6. If the user re-opens the panel later with only one session active, skip the QuickPick

#### 3.3.2 QuickPick UI

```
► Select OpenCode Session to Track
───────────────────────────────────
  a1b2c3d4…  │ Terminal: project-1  │ 2s ago  │ 3 agents active
  e5f6g7h8…  │ Terminal: project-2  │ 15s ago │ 1 agent active
  ~~~~~~~~~
  [Cancel — Show All Sessions]
```

#### 3.3.3 Persistence

- The selected session ID is stored in `extensionContext.workspaceState` (survives VSCode restart)
- If the stored session is no longer active, the QuickPick is shown again
- User can change the selected session via a new command `opencode-pets.selectSession`
- A "session" indicator is shown in the panel header (clickable to re-open QuickPick)

### 3.4 F4 — Multi-Terminal Tabs (P1 — Future Enhancement)

#### 3.4.1 Tab Bar

A horizontal tab bar at the top of the dashboard panel shows one tab per active session:

```
┌──────────────────────────────────────────────────────────────┐
│  ✦ OpenCode Pets                      [▲ session selector]  │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ project-1 │  │ project-2 │  │          │  │          │    │
│  │ ● active  │  │ ○ idle    │  │          │  │          │    │
│  └──────────┘  └──────────┘  └──────────└  └──────────┘    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  (agents for selected session shown here)                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Tab Behavior

- Each tab shows the session's terminal title (or truncated ID)
- Active tab's agents are displayed in the main area
- Tab has a status indicator: green dot (active < 30s), yellow (active < 2min), gray (stale)
- Clicking a tab switches the displayed session
- Closing a tab removes it from the view (session data remains on server)

#### 3.4.3 Implementation Note

F4 is designated **P1** (future) and is **out of scope** for the current implementation. The spec includes it for architecture completeness, but no code changes for F4 are required in this phase. However, the session data model and API must be designed to support F4 without breaking changes.

---

## 4. Technical Architecture

### 4.1 Updated Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       VSCode Extension Host                              │
│                                                                          │
│  ┌─────────────────────────────────────┐                                │
│  │  extension.ts                        │                                │
│  │  - activate():                       │                                │
│  │    ├── start eventServer (port N)    │                                │
│  │    ├── writePortToFile(N)            │  ← NEW: writes ~/.opencode/dashboard.json
│  │    ├── copyPluginToUserDir()         │  ← NEW: ensures plugin available
│  │    └── register commands             │                                │
│  │  - deactivate():                     │                                │
│  │    ├── removePortFile()              │  ← NEW: cleanup                │
│  │    ├── stop server                   │                                │
│  │    └── dispose panel                 │                                │
│  └─────────────────────────────────────┘                                │
│                    │                                                     │
│  ┌─────────────────▼────────────────────────────────────┐               │
│  │  eventServer.js                                      │               │
│  │  - _sessions: Map<sessionId, SessionState>            │  ← CHANGED    │
│  │  - POST /event → create/update session                │               │
│  │  - GET /sessions → list active sessions                │  ← NEW       │
│  │  - GET /stream?session=<id> → filtered SSE             │  ← CHANGED    │
│  │  - writePortToFile() → ~/.opencode/dashboard.json     │  ← NEW       │
│  │  - periodic session cleanup (5min timeout)             │  ← NEW       │
│  └──────────────────────────────────────────────────────┘               │
│                    │                                                     │
│  ┌─────────────────▼────────────────────────────────────┐               │
│  │  petsPanel.ts                                        │               │
│  │  - createOrShow():                                    │               │
│  │    ├── fetchActiveSessions() → QuickPick if >1        │  ← NEW       │
│  │    └── create panel with selectedSessionId             │  ← CHANGED    │
│  │  - command: opencode-pets.selectSession               │  ← NEW       │
│  │  - session indicator in panel header                  │  ← NEW       │
│  └──────────────────────────────────────────────────────┘               │
│                    │                                                     │
│                    │ postMessage({ selectedSession, event, sessions })   │
│                    ▼                                                     │
│  ┌──────────────────────────────────────────────────────┐               │
│  │  Webview Panel (pets.html)                            │               │
│  │  - SessionAwareStateManager (filters by session)      │  ← CHANGED    │
│  │  - agent grid per session                             │               │
│  │  - session indicator in header (clickable)            │  ← NEW       │
│  │  - [F4] tab bar (future)                              │               │
│  └──────────────────────────────────────────────────────┘               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
          ▲                                    │
          │                                    │ POST /event
          │  read ~/.opencode/dashboard.json   │ + session_id
          │                                    ▼
┌─────────┴────────────────────────────────────────────────────────────┐
│  opencode plugin (dashboard.js)                                      │
│  - readPortFromFile() → ~/.opencode/dashboard.json                   │
│  - generateSessionId() → UUID v4                                     │
│  - sends { type, data, time, session_id } via POST                   │
│  - retry with backoff on connection failure                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Updated Folder Structure

```
opencode-pets/
├── package.json                    # VSCode extension manifest
├── tsconfig.json                   # TypeScript config
├── .vscodeignore                   # Files excluded from VSIX
├── src/
│   ├── extension.ts                # Activation, command, lifecycle
│   ├── panel/
│   │   ├── petsPanel.ts            # WebviewPanel management + session QuickPick
│   │   ├── sessionManager.ts       # NEW: session selection persistence
│   │   └── html/
│   │       ├── pets.html           # Webview HTML shell
│   │       ├── css/
│   │       │   └── theme.css       # VSCode theme variables
│   │       └── js/
│   │           ├── main.js         # Webview entry point + SSE client
│   │           ├── renderer.js     # Canvas rendering engine
│   │           ├── sprites.js      # All sprite definitions
│   │           ├── state.js        # Event → state mapping + per-agent queues
│   │           └── palette.js      # Color palette
│   ├── server/
│   │   └── eventServer.js          # HTTP/SSE server with session tracking
│   └── utils/
│       └── portFile.js             # NEW: read/write ~/.opencode/dashboard.json
├── .opencode/
│   └── plugins/
│       └── dashboard.js            # UPDATED: port discovery + session_id
├── spec.md                         # This document
├── README.md
└── documentation/
    ├── current/
    │   └── implementation-plan.md
    ├── docs/
    │   ├── extension.md
    │   ├── plugin/
    │   │   └── dashboard.md
    │   ├── server/
    │   │   └── eventServer.md
    │   └── panel/
    │       ├── petsPanel.md
    │       └── html/
    │           └── (js module docs)
    └── test_cases/
        └── (test case files)
```

### 4.3 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Extension host | TypeScript (Node.js) | Required for VSCode extensions |
| Webview | HTML5 + CSS3 + vanilla JS | No frameworks; lean pixel-art |
| Rendering | Canvas 2D API | Matches existing approach |
| Events | Webview `postMessage` | VSCode Webview messaging API |
| HTTP server | Node.js built-in `http` | Zero dependencies |
| SSE | Server-Sent Events (built-in) | Push from server → Webview |
| Session persistence | `extensionContext.workspaceState` | VSCode key-value store |
| Port file | JSON on filesystem | Cross-platform, no DB needed |
| Plugin runtime | opencode plugin API (`fetch`) | Built-in, no extra deps |

### 4.4 Port File (`~/.opencode/dashboard.json`)

#### Schema

```typescript
interface DashboardPortFile {
  port: number            // Actual listening port (3001, 3002, …)
  pid: number             // Process ID of extension host
  startedAt: number       // Unix timestamp (ms) when server started
  version: number         // Schema version (initially 1)
}
```

#### Example

```json
{
  "port": 3002,
  "pid": 48291,
  "startedAt": 1718000000000,
  "version": 1
}
```

#### Lifecycle

| Event | Action |
|-------|--------|
| Server starts successfully | Write file with actual port |
| Server fails to start | Do NOT write file |
| Port changes (fallback) | Rewrite file with new port |
| Extension deactivates | Delete file (cleanup) |
| VSCode crashes | File left on disk; plugin reads stale port, POST fails, plugin re-reads and eventually falls back to default. Next extension start overwrites the file. |

### 4.5 Session Data Model

```typescript
interface SessionState {
  id: string                    // UUID v4
  agents: Map<string, AgentState>  // Per-agent state within this session
  lastSeen: number              // Unix timestamp (ms) of most recent event
  createdAt: number             // Unix timestamp (ms) when first event received
  terminalLabel?: string        // Optional human-readable label from plugin
}

interface AgentState {
  state: string                 // 'idle' | 'happy' | 'error' | 'thinking' | 'write' | 'read' | 'bash'
  agent: string                 // Agent ID (explore, general, ssd-planner, etc.)
  tool: string                  // Current tool name (or '')
  detail: string                // Human-readable detail
  time: number                  // When this state was set (epoch ms)
}

interface SessionsResponse {
  sessions: Array<{
    id: string
    label?: string
    lastSeen: number
    createdAt: number
    agentCount: number
    activeAgentCount: number     // Agents with non-idle state
  }>
}
```

---

## 5. Component Specs

### 5.1 `src/utils/portFile.js` — NEW

**File:** `src/utils/portFile.js`

**Purpose:** Read and write `~/.opencode/dashboard.json` for port discovery.

**Exports:**

| Export | Type | Description |
|--------|------|-------------|
| `PORT_FILE_PATH` | `string` | Resolved path to `~/.opencode/dashboard.json` |
| `writePortFile(port)` | `Promise<void>` | Write port info to file (creates `~/.opencode/` dir if needed) |
| `readPortFile()` | `Promise<DashboardPortFile \| null>` | Read and parse port file; returns null if absent/malformed |
| `removePortFile()` | `Promise<void>` | Delete the port file (cleanup) |

**Cross-Platform Path:**
```javascript
const PORT_FILE_PATH = path.join(
  os.homedir(),
  '.opencode',
  'dashboard.json'
)
```

**Acceptance:**
- AC1: `writePortFile(3002)` creates `~/.opencode/dashboard.json` with correct content
- AC1: `readPortFile()` returns parsed JSON when file exists, null when absent
- AC1: `removePortFile()` deletes the file without error even if absent

### 5.2 `src/server/eventServer.js` — UPDATED

**File:** `src/server/eventServer.js`

**Purpose:** Receive events from opencode plugins, track per-session state, provide SSE streams.

**Changes from v1:**

| Change | Description |
|--------|-------------|
| `_sessions: Map` replaces `_current: object` | Per-session state tracking |
| `POST /event` parses `session_id` | Routes event to correct session |
| `GET /sessions` — NEW | Returns list of active sessions |
| `GET /stream?session=<id>` | Optional filtering by session |
| Session cleanup timer | Reaps sessions idle > 5 minutes |

**New Internal Methods:**

```javascript
class EventServer {
  constructor()
  // New properties:
  this._sessions = new Map()    // sessionId → SessionState
  this._cleanupInterval = null

  // Updated start():
  start(port) → Promise<number>
    // After successful listen:
    await writePortFile(this._port)
    this._startCleanup()

  // New stop():
  stop()
    await removePortFile()
    this._stopCleanup()
    // ... close SSE connections, close server

  // Updated _stateFromEvent():
  // Now extracts session_id and routes to session
  _processEvent(event, sessionId) → SessionState
    // 1. Get or create session for sessionId
    // 2. Map event to AgentState
    // 3. Update session's per-agent state
    // 4. Update lastSeen
    // 5. Return updated SessionState

  // New: get sessions list
  getSessions() → SessionsResponse[]
    // Filter out stale sessions
    // Return summary for each

  // New: get filtered state for SSE
  _getFilteredState(sessionId) → SessionState | null

  // New: periodic cleanup
  _startCleanup()
    // setInterval every 60s: remove sessions with lastSeen > 5min ago
  _stopCleanup()
}
```

**SSE Event Format (updated):**
```
event: state
data: {"sessionId":"a1b2c3...","current":{"state":"write","agent":"ssd-spec-writer",...}}

event: heartbeat
data: {"time":1718000000000}
```

- Heartbeat every 30s to keep SSE connection alive
- When `GET /stream?session=<id>` is used, only events for that session are sent
- When no session filter, ALL session events are sent (with session ID so Webview can route)

**Acceptance:**
- AC4: Events with different session_ids create separate session states
- AC4: `_sessions` map maintains independent per-agent states per session
- AC4: `getSessions()` returns only sessions with activity in last 5 minutes
- AC7: Events without `session_id` field go to "default" session (backward compat)

### 5.3 `.opencode/plugins/dashboard.js` — UPDATED

**File:** `.opencode/plugins/dashboard.js` (extension's copy)

**Purpose:** OpenCode plugin that reads port from file, sends events with session_id.

**Changes from v1:**

```javascript
// ── Constants ──
const PORT_FILE = process.env.HOME || process.env.USERPROFILE
  ? (process.env.HOME || process.env.USERPROFILE) + '/.opencode/dashboard.json'
  : null

const DEFAULT_SERVER = 'http://localhost:3001/event'
const MAX_RETRIES = 5
const RETRY_BASE_MS = 500

// ── Session ID — generated once per plugin load ──
const SESSION_ID = generateUUID()

// ── Port Discovery ──
function readPortFromFile() {
  // Returns the port number or null
  // Reads JSON from PORT_FILE, returns port field
}

function discoverServerUrl() {
  // 1. Try readPortFromFile()
  // 2. If port found → return 'http://localhost:{port}/event'
  // 3. If not found → return DEFAULT_SERVER
}

// ── Send with retry ──
async function send(type, data) {
  const url = discoverServerUrl()
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data,
          time: Date.now(),
          session_id: SESSION_ID,
        }),
      })
      return  // Success
    } catch {
      // Retry with backoff
      await new Promise(r => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)))
    }
  }
  // All retries exhausted — silently fail
}
```

**Exported Plugin:**
```javascript
export const DashboardPlugin = async () => {
  // If terminal label is available in context, include it
  const terminalLabel = process.env.OPENCODE_TERMINAL_TITLE || ''

  send('plugin.loaded', { agent: 'ssd-orchestrator', terminal: terminalLabel })

  return {
    'tool.execute.before': async (input, output) => {
      const agent = output.agent || TOOL_AGENT_MAP[input.tool] || 'general'
      send('tool.start', { agent, tool: input.tool, args: output.args, detail: agent + ' running ' + input.tool })
    },
    'tool.execute.after': async (input, result) => {
      const agent = result.agent || TOOL_AGENT_MAP[input.tool] || 'general'
      send('tool.end', { agent, tool: input.tool })
    },
    event: async ({ event }) => {
      if (['session.created', 'session.idle', 'session.error'].includes(event.type)) {
        send('session', { type: event.type, agent: event.agent || 'ssd-orchestrator' })
      }
    },
    stop: async () => {
      send('session', { type: 'session.stopped', agent: 'ssd-orchestrator' })
    },
  }
}
```

**Note:** The `TOOL_AGENT_MAP` remains unchanged from v1.

**Acceptance:**
- AC2: Plugin reads port from `~/.opencode/dashboard.json`
- AC3: Plugin generates unique session_id on each load
- AC3: All events include `session_id` in POST body
- AC7: If port file is missing, plugin falls back to `http://localhost:3001/event`
- AC8: Plugin works when loaded from user's project `.opencode/plugins/` directory

### 5.4 `src/panel/petsPanel.ts` — UPDATED

**File:** `src/panel/petsPanel.ts`

**Purpose:** Manage Webview panel. New responsibilities: session selection via QuickPick, session state persistence.

**Changes from v1:**

```typescript
export class PetsPanel {
  // New static/instance properties:
  private _selectedSessionId: string | null  // Currently tracked session
  private _sessions: SessionSummary[]        // Cached sessions list

  // Updated createOrShow():
  static async createOrShow(eventServer, context) {
    // 1. Fetch active sessions from eventServer.getSessions()
    // 2. If sessions.length === 0: open panel with "default" session
    // 3. If sessions.length === 1: auto-select that session
    // 4. If sessions.length >= 2: show QuickPick
    // 5. Open panel with selected session
  }

  // NEW: Session selection command
  static async selectSession(eventServer) {
    // Show QuickPick with active sessions
    // Allow user to switch, or select "Show All"
  }

  // NEW: Session QuickPick
  private static _showSessionPicker(sessions): Promise<string | null> {
    // Create QuickPick with:
    // - Each session as an item
    // - "Show All Sessions" as last item
    // Return selected sessionId or null (for "all")
  }
}
```

**Session Indicator in Panel:**
The panel header includes a session indicator that shows:
- When tracking a specific session: `Session: a1b2… (click to change)`
- When tracking all sessions: `All Sessions (click to filter)`
- Clicking the indicator triggers `selectSession()`

**Session Persistence:**
- Stored in `context.workspaceState` under key `opencodePets.selectedSession`
- On VSCode restart, the stored session ID is restored
- If the stored session is no longer active, the QuickPick is shown

**Acceptance:**
- AC5: QuickPick shown when ≥2 sessions detected
- AC5: Selecting a session filters the panel to that session's events
- AC6: Only selected session's events affect agents

### 5.5 `src/panel/html/js/main.js` — UPDATED

**File:** `src/panel/html/js/main.js`

**Purpose:** Webview entry point. New: receive session selection, filter events.

**Changes from v1:**

```javascript
// New state:
let selectedSessionId = null  // Set by extension via postMessage

// Updated message handler:
window.addEventListener('message', function (event) {
  const msg = event.data
  if (!msg) return

  switch (msg.type) {
    case 'event':
      // Filter by session if one is selected
      if (selectedSessionId && msg.sessionId !== selectedSessionId) {
        return  // Discard events from other sessions
      }
      handleEventData({ current: msg.data, time: msg.time || 0 })
      break

    case 'sessionSelected':
      // Change which session we're tracking
      selectedSessionId = msg.sessionId
      // Clear existing state queues
      clearAllStateQueues()
      // Re-fetch initial state for the new session
      break

    case 'sessions':
      // Update session list display (if tabs are shown)
      updateSessionTabs(msg.sessions)
      break

    case 'theme':
      // ... unchanged
      break
  }
})

// NEW: Session tab click handler (for F4)
function onSessionTabClick(sessionId) {
  if (vscode) {
    vscode.postMessage({ type: 'selectSession', sessionId })
  }
}
```

**Acceptance:**
- AC5: Panel receives `sessionSelected` message and switches sessions
- AC6: Events not matching the selected session are discarded

### 5.6 `src/extension.ts` — UPDATED

**File:** `src/extension.ts`

**Purpose:** Extension entry point. New: write port file on activation, clean up on deactivation.

**Changes from v1:**

```typescript
import { writePortFile, removePortFile } from './utils/portFile'

export function activate(context: vscode.ExtensionContext): void {
  eventServer = new EventServer()

  // After server starts successfully, write port file
  eventServer.start(configPort).then((port: number) => {
    writePortFile(port).catch(err => {
      console.warn('[OpenCode Pets] Failed to write port file:', err.message)
    })
    // ... rest of activation
  })

  // Register new command for session selection
  const selectSessionCmd = vscode.commands.registerCommand(
    'opencode-pets.selectSession',
    () => {
      PetsPanel.selectSession(eventServer)
    }
  )
  context.subscriptions.push(selectSessionCmd)

  // Show session selector on panel creation
  // (Handled by PetsPanel.createOrShow)
}

export function deactivate(): void {
  if (eventServer) {
    eventServer.stop()
  }
  removePortFile().catch(() => {})  // Cleanup
  // ...
}
```

**New package.json commands:**
```json
{
  "commands": [
    {
      "command": "opencode-pets.showPanel",
      "title": "OpenCode Pets: Show Agent Dashboard"
    },
    {
      "command": "opencode-pets.selectSession",
      "title": "OpenCode Pets: Select OpenCode Session"
    }
  ]
}
```

**Acceptance:**
- AC1: Extension writes port file on successful server start
- AC1: Extension deletes port file on deactivation

### 5.7 `src/panel/sessionManager.ts` — NEW

**File:** `src/panel/sessionManager.ts`

**Purpose:** Manage session selection state and QuickPick UI.

**Exports:**

```typescript
export interface SessionSummary {
  id: string
  label?: string
  lastSeen: number
  createdAt: number
  agentCount: number
  activeAgentCount: number
}

export class SessionManager {
  constructor(private eventServer: EventServer)

  /**
   * Fetch active sessions from the server.
   */
  async getActiveSessions(): Promise<SessionSummary[]>

  /**
   * Show VSCode QuickPick for session selection.
   * Returns selected sessionId, or null for "Show All", or undefined if cancelled.
   */
  async showSessionPicker(): Promise<string | null | undefined>

  /**
   * Get persisted session ID from workspace state.
   */
  getPersistedSession(context: vscode.ExtensionContext): string | null

  /**
   * Persist session ID to workspace state.
   */
  persistSession(context: vscode.ExtensionContext, sessionId: string | null): void
}
```

**QuickPick Item Format:**

```
┌─────────────────────────────────────────────────────┐
│ pick.items = [                                       │
│   { label: "$(terminal) Terminal 1 — project-a",    │
│     description: "3 agents • active 2s ago",         │
│     sessionId: "abc123..." },                        │
│   { label: "$(terminal) Terminal 2 — project-b",     │
│     description: "1 agent • active 15s ago",         │
│     sessionId: "def456..." },                        │
│   { label: "$(symbol-event) Show All Sessions",      │
│     description: "View events from all terminals",   │
│     sessionId: null },                               │
│ ]                                                     │
└─────────────────────────────────────────────────────┘
```

**Acceptance:**
- AC5: `showSessionPicker()` returns selected session ID
- AC5: QuickPick includes "Show All Sessions" option
- AC5: `getPersistedSession()` returns stored session ID (or null)

### 5.8 `src/server/eventServer.js` — Old `track.js` Backward Compat

The existing `multi-agents/.opencode/plugins/track.js` does NOT include `session_id`. The updated `eventServer.js` MUST handle this gracefully:

```javascript
_processEvent(event, sessionId) {
  // If sessionId is missing or undefined, use 'default'
  const sid = sessionId || 'default'

  if (!this._sessions.has(sid)) {
    this._sessions.set(sid, {
      id: sid,
      agents: {},
      lastSeen: Date.now(),
      createdAt: Date.now(),
      terminalLabel: '',
    })
  }

  const session = this._sessions.get(sid)
  // ... update session state
}
```

**This means:**
- The old `track.js` plugin continues to work — all its events go to the `"default"` session
- The new `dashboard.js` plugin creates named sessions per terminal
- Both can coexist on the same server

**Acceptance:**
- AC7: Events without `session_id` are tracked under the "default" session
- AC7: The "default" session appears in the sessions list if any events arrive

---

## 6. Data Flow

### 6.1 Happy Path: Single Terminal, Extension Starts First

```
1. VSCode starts → extension activates
2. Extension starts eventServer on port 3002 (3001 was in use)
3. Extension writes ~/.opencode/dashboard.json → { port: 3002, pid: 12345 }
4. User opens terminal, runs opencode
5. opencode loads dashboard.js plugin
6. Plugin reads ~/.opencode/dashboard.json → port = 3002
7. Plugin generates SESSION_ID = "a1b2c3d4-..."
8. Plugin POSTs to http://localhost:3002/event + session_id
9. Extension receives event, routes to session "a1b2c3d4-..."
10. SSE broadcasts state to Webview
11. Panel shows agents animating

Port File:                    Plugin:
┌──────────────┐              ┌─────────────────────┐
│ port: 3002   │  ◄──read──  │ discoverServerUrl() │
│ pid: 12345   │              │ → "localhost:3002"  │
└──────────────┘              └─────────────────────┘
```

### 6.2 Multiple Terminals: Two opencode Sessions

```
Terminal 1: opencode          Terminal 2: opencode
(dashboard.js)                (dashboard.js)
SESSION_ID = "aaa"            SESSION_ID = "bbb"
    │                              │
    │ POST /event                   │ POST /event
    │ { session_id: "aaa",          │ { session_id: "bbb",
    │   type: "tool.start",         │   type: "tool.start",
    │   data: { tool: "write" } }   │   data: { tool: "bash" } }
    │                              │
    ▼                              ▼
    ┌──────────────────────────────────────┐
    │  EventServer                          │
    │                                       │
    │  _sessions = {                        │
    │    "aaa": {                           │
    │      agents: {                        │
    │        "ssd-spec-writer": { state: "write", ... }
    │      }                                │
    │    },                                 │
    │    "bbb": {                           │
    │      agents: {                        │
    │        "general": { state: "bash", ... }
    │      }                                │
    │    }                                  │
    │  }                                    │
    │                                       │
    │  GET /sessions → [                    │
    │    { id: "aaa", agentCount: 1, ... },  │
    │    { id: "bbb", agentCount: 1, ... },  │
    │  ]                                     │
    └──────────────────────────────────────┘
         │
         │ User opens dashboard
         ▼
    PetsPanel.createOrShow()
         │
         │ GET /sessions → 2 sessions found
         ▼
    Show QuickPick: "Select terminal to track"
         │
         │ User selects "aaa"
         ▼
    Panel opens with session "aaa"
         │
         │ SSE /stream?session=aaa
         ▼
    Only "aaa" events → only "aaa" agents animate
```

### 6.3 Plugin Retry: Terminal Starts Before Extension

```
1. User opens terminal, runs opencode
2. Plugin loads, tries to read ~/.opencode/dashboard.json
3. File does NOT exist (extension not started yet)
4. Plugin falls back to http://localhost:3001/event
5. POST to 3001 fails (nothing listening)
6. Plugin retries: wait 500ms, re-read file, retry POST
7. (meanwhile) VSCode starts, extension activates on port 3002
8. Extension writes ~/.opencode/dashboard.json → { port: 3002 }
9. Plugin re-reads file → port = 3002
10. Plugin POSTs to http://localhost:3002/event → SUCCESS
11. Events start flowing

Timeline:
Plugin: [read fail]→[retry]→[retry]→[read ok]→[POST ok]
             0         500ms    1500ms   3500ms
Extension:                        [start]→[write file]
                             3000ms      3100ms
```

### 6.4 Session Cleanup: Stale Session Reaps

```
t=0:   Session "aaa" sends event (lastSeen = t)
t=60:  Cleanup tick → "aaa" lastSeen = t, t+60 < t, still active
t=360: Cleanup tick → "aaa" lastSeen = t, now +300s > t+300s → STALE
       Session "aaa" removed from _sessions Map
t=361: GET /sessions → "aaa" no longer in list
```

### 6.5 Backward Compat: Old track.js Plugs In

```
Old track.js loads
     │
     │ No session_id in events
     ▼
EventServer._processEvent(event, undefined)
     │
     │ sessionId = 'default'
     ▼
_sessions["default"] created/updated
     │
     ▼
GET /sessions returns [{ id: "default", ... }]
     │
     ▼
User sees "default" session in QuickPick
Works identically to v1 of the extension
```

---

## 7. API Surface

### 7.1 HTTP Endpoints (eventServer)

| Method | Path | Query Params | Purpose | Changed? |
|--------|------|--------------|---------|----------|
| `POST` | `/event` | — | Receive event from plugin | UPDATED: parses `session_id` |
| `GET` | `/stream` | `?session=<id>` | SSE event stream | UPDATED: optional session filter |
| `GET` | `/sessions` | — | List active sessions | NEW |
| `GET` | `/` | — | Health check / status | Unchanged |

### 7.2 SSE Events

| Event Name | Payload | Purpose |
|------------|---------|---------|
| `state` | `{ sessionId, current: AgentState }` | Agent state update |
| `session` | `{ sessionId, sessions: SessionSummary[] }` | Session list change |
| `heartbeat` | `{ time }` | Keep-alive (every 30s) |

### 7.3 Webview ↔ Extension Messages

| Direction | Type | Payload | Purpose |
|-----------|------|---------|---------|
| Webview → Ext | `ready` | `{}` | Panel loaded, ready for events |
| Webview → Ext | `selectSession` | `{ sessionId }` | User selected a session |
| Ext → Webview | `ready` | `{ selectedSession, sessions }` | Initial state broadcast |
| Ext → Webview | `event` | `{ data, time, sessionId }` | Forwarded SSE event |
| Ext → Webview | `sessionSelected` | `{ sessionId }` | Session selection changed |
| Ext → Webview | `sessions` | `{ sessions: SessionSummary[] }` | Updated session list |
| Ext → Webview | `theme` | `{ theme: 'light'\|'dark' }` | Theme change notification |

### 7.4 VSCode Commands

| Command | Purpose |
|---------|---------|
| `opencode-pets.showPanel` | Open/reveal the dashboard panel |
| `opencode-pets.selectSession` | Show session selection QuickPick |

---

## 8. UI Specifications

### 8.1 Session Selection QuickPick

```
[Terminal icon] Terminal 1 — my-project      3 agents • active 2s ago
[Terminal icon] Terminal 2 — other-project   1 agent  • active 15s ago
────────────────────────────────────────────────────────────────────
[Globe icon]    Show All Sessions            View events from all sources
```

**Visual treatment:**
- Active sessions (< 30s since last event): green terminal icon
- Idle sessions (30s – 5min): yellow terminal icon
- Stale sessions (> 5min): gray terminal icon (shouldn't appear — cleaned up)
- Each item shows: title, agent count, relative last-active time

### 8.2 Session Indicator in Panel Header

```
┌──────────────────────────────────────────────────────────────┐
│  ✦ OpenCode Pets              [Sessions: 2] [● Terminal 1]  │
├──────────────────────────────────────────────────────────────┤
```

- Clicking the session name reopens the QuickPick
- Shows count of active sessions
- Green dot if selected session active < 30s, yellow if 30s–5min, gray if stale

### 8.3 [F4] Multi-Terminal Tab Bar (Future)

```
┌──────────────────────────────────────────────────────────────┐
│  ✦ OpenCode Pets                                            │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  ● Term-1    │  │  ○ Term-2    │  │  + Add tab   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├──────────────────────────────────────────────────────────────┤
│  (agents for Term-1 shown here)                              │
└──────────────────────────────────────────────────────────────┘
```

### 8.4 Session State in Status Bar

The VSCode status bar shows the session state (when panel is visible):

```
OpenCode Pets: Tracking Terminal 1 (2 agents active)  |  [Switch Session]
```

---

## 9. Acceptance Criteria

### AC1 — Port Discovery: Extension writes port to ~/.opencode/dashboard.json

| # | Step | Expected |
|---|------|----------|
| 1.1 | Extension activates and server starts on port 3002 (3001 busy) | File `~/.opencode/dashboard.json` exists |
| 1.2 | Read the file | Content is valid JSON: `{ port: 3002, pid: <number>, startedAt: <number>, version: 1 }` |
| 1.3 | Stop the extension (deactivate) | File is deleted |
| 1.4 | Start extension again, server on port 3001 (available) | File contains `{ port: 3001, ... }` |
| 1.5 | Verify using `curl` that server is listening on the port in the file | `curl -X POST http://localhost:<port>/event` returns `ok` |

### AC2 — Port Discovery: Plugin reads ~/.opencode/dashboard.json

| # | Step | Expected |
|---|------|----------|
| 2.1 | Plugin loads with port file present | Plugin reads port from file |
| 2.2 | Plugin POSTs events to the correct port | Server receives events |
| 2.3 | Plugin loads without port file | Plugin falls back to `http://localhost:3001/event` |
| 2.4 | Plugin POST fails, port file appears later | Plugin retries and eventually succeeds |

### AC3 — Session Identity: Plugin generates and sends session_id

| # | Step | Expected |
|---|------|----------|
| 3.1 | Plugin loads in terminal 1 | A UUID v4 session_id is generated |
| 3.2 | Plugin loads in terminal 2 | A different UUID v4 session_id is generated |
| 3.3 | All events from terminal 1 include `session_id: "<id1>"` | POST body checked |
| 3.4 | All events from terminal 2 include `session_id: "<id2>"` | POST body checked |
| 3.5 | Check `session_id` format | Matches UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/` |

### AC4 — Session Identity: Server tracks events per session

| # | Step | Expected |
|---|------|----------|
| 4.1 | Send event with `session_id: "aaa"` | Server creates session "aaa" |
| 4.2 | Send event with `session_id: "bbb"` | Server creates session "bbb" (separate) |
| 4.3 | GET /sessions | Returns both sessions with correct counts |
| 4.4 | Session "aaa" has agent "explore" in "read" state | Session "bbb" agent states are unaffected |
| 4.5 | Session "aaa" receives no events for 6 minutes | Session "aaa" is cleaned up from _sessions |
| 4.6 | After cleanup, GET /sessions | "aaa" no longer in list |

### AC5 — Terminal Selection: QuickPick for multiple sessions

| # | Step | Expected |
|---|------|----------|
| 5.1 | Two opencode terminals running → open dashboard | QuickPick is shown with both sessions |
| 5.2 | Select one session | Panel opens, shows only that session's agents |
| 5.3 | Events from the OTHER session | Panel ignores them (agents unaffected) |
| 5.4 | Only one terminal running → open dashboard | No QuickPick (auto-selects the only session) |
| 5.5 | No terminals running → open dashboard | Opens with no agents, shows "Waiting for opencode session..." |
| 5.6 | Run command `opencode-pets.selectSession` while panel open | QuickPick appears again |
| 5.7 | Select "Show All Sessions" | Panel shows all sessions (unfiltered) |

### AC6 — Session Selection: Only selected session affects agents

| # | Step | Expected |
|---|------|----------|
| 6.1 | Dashboard tracking session "aaa" | Agents react ONLY to "aaa" events |
| 6.2 | Send event to session "bbb" (tool.start, write) | Dashboard agents DO NOT change |
| 6.3 | Send event to session "aaa" (tool.start, bash) | Dashboard agents change to "bash" |
| 6.4 | Switch session to "bbb" via QuickPick | Dashboard shows "bbb" state immediately |

### AC7 — Backward Compat: Old track.js works without modification

| # | Step | Expected |
|---|------|----------|
| 7.1 | Old `track.js` plugin loaded (no session_id) | Events routed to "default" session |
| 7.2 | Old plugin sends `tool.start` event | Server processes, adds to "default" session |
| 7.3 | GET /sessions | Returns session with id "default" |
| 7.4 | Dashboard selects "default" session | Events from old plugin displayed correctly |

### AC8 — Plugin Location: User project loads the plugin

| # | Step | Expected |
|---|------|----------|
| 8.1 | Copy `dashboard.js` to any project's `.opencode/plugins/` | Plugin loads when opencode runs in that project |
| 8.2 | Plugin works identically regardless of load path | Port discovery + session_id both work |
| 8.3 | opencode config references plugin by path | Plugin loads from referenced location |

---

## 10. Test Plan

### 10.1 Unit Tests

| ID | Component | Test | Expected |
|----|-----------|------|----------|
| UT1 | `portFile.js` | `writePortFile(3002)` creates file with correct JSON | File exists, contents match |
| UT2 | `portFile.js` | `readPortFile()` returns parsed object | Returns `{ port: 3002, pid, startedAt, version }` |
| UT3 | `portFile.js` | `readPortFile()` when file missing | Returns `null` |
| UT4 | `portFile.js` | `removePortFile()` deletes file | File does not exist |
| UT5 | `portFile.js` | `removePortFile()` when file already missing | No error thrown |
| UT6 | `eventServer.js` | Event with `session_id: "abc"` creates new session | `_sessions` has key "abc" |
| UT7 | `eventServer.js` | Event without `session_id` routes to "default" | `_sessions` has key "default" |
| UT8 | `eventServer.js` | Two events, same session, different agents | Session has both agent states |
| UT9 | `eventServer.js` | Two events, different sessions | Sessions are independent |
| UT10 | `eventServer.js` | `getSessions()` returns only active sessions | Stale sessions excluded |
| UT11 | `eventServer.js` | Session cleanup removes stale sessions | Session removed after 5min+ timeout |
| UT12 | `eventServer.js` | SSE stream filtered by session | Only matching session events sent |
| UT13 | `dashboard.js` (unit test via Node) | `generateUUID()` returns valid UUID v4 | Matches UUID regex |
| UT14 | `dashboard.js` | `readPortFromFile()` returns port | Returns number |
| UT15 | `dashboard.js` | `readPortFromFile()` when file missing | Returns `null` |
| UT16 | `sessionManager.ts` | `getActiveSessions()` returns parsed list | Returns `SessionSummary[]` |
| UT17 | `main.js` (Webview unit) | Event with non-matching session_id is discarded | No state change |
| UT18 | `main.js` | Event with matching session_id is processed | State change occurs |

### 10.2 Integration Tests

| ID | Test | Steps | Expected |
|----|------|-------|----------|
| IT1 | Full pipeline: single terminal | 1. Start extension on port 3002<br>2. Start opencode with dashboard.js<br>3. Run a tool | Events reach server → panel shows animation |
| IT2 | Full pipeline: two terminals | 1. Start extension<br>2. Start TWO opencode terminals<br>3. Run tools in both | Two sessions visible in GET /sessions |
| IT3 | Port discovery: plugin finds port | 1. Start extension (port 3003)<br>2. Load plugin after 1s delay | Plugin reads file, POSTs to 3003 |
| IT4 | Port discovery: fallback | 1. NO extension running<br>2. Load plugin | Plugin falls back to 3001, retries |
| IT5 | Session QuickPick | 1. Two terminals active<br>2. Open dashboard | QuickPick appears; selecting one filters events |
| IT6 | Backward compat: old track.js | 1. Load old track.js (no session_id)<br>2. Run opencode | Events go to "default" session |
| IT7 | Session persistence | 1. Select session "abc"<br>2. Close and reopen panel | Panel remembers session "abc" |
| IT8 | Session cleanup | 1. Send events to session "xyz"<br>2. Wait 6 minutes<br>3. GET /sessions | "xyz" no longer in list |

### 10.3 Manual Test Scenarios

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| M1 | **Three terminals, complex routing** | 3 terminals running; select session A; run tools in all 3 | Only session A's events affect dashboard |
| M2 | **Extension restart with active sessions** | Stop VSCode (sessions "abc", "def" active); restart; open panel | Sessions list refreshed; stale sessions cleaned up |
| M3 | **Port conflict resolution** | Kill extension on 3001; start multi-agents server on 3001; start extension | Extension uses 3002+; port file updated |
| M4 | **Plugin retry success** | Start plugin first (no extension); wait 5s; start extension | Plugin retries, eventually connects |
| M5 | **Switch session mid-workflow** | Open dashboard on session A; run opencode on session B; switch to B via QuickPick | Dashboard immediately shows B's state |
| M6 | **Old plugin + new plugin coexistence** | Term 1 uses old track.js; Term 2 uses new dashboard.js; open dashboard | Both sessions visible; can switch between them |
| M7 | **Zero sessions edge case** | Open dashboard with NO opencode running | Shows "Waiting for opencode session..." message |
| M8 | **Dashboard on Windows** | Test on Windows with `%USERPROFILE%` path | Port file created/read correctly; plugin works |

### 10.4 Test Infrastructure

- Unit tests: Run via `npm test` (Node.js + a test runner like `mocha` or `node:test`)
- Integration tests: Shell scripts that start the server, POST events, and verify behavior
- Manual tests: Documented scenarios for QA
- Cross-platform: Test on Linux, macOS, Windows (for path resolution)

---

## 11. Backward Compatibility

| Component | Impact | Mitigation |
|-----------|--------|------------|
| `multi-agents/.opencode/plugins/track.js` | No session_id | Server routes to "default" session |
| `multi-agents/tracker/server.js` | No changes needed | Standalone server still works on port 3001 |
| `opencode-pets v1.0` Webview JS | Events without session_id | "default" session handles them |
| Existing SSE clients | `data:` format changed slightly | Added `sessionId` field alongside `current`; old clients ignore extra fields |
| Extension settings | No breaking changes | `opencodePets.serverPort` setting still honored |

### Migration Path

1. **Current state**: Plugin hardcodes port 3001, no session ID
2. **After update**: Plugin reads port file, sends session_id
3. **Old plugins**: Continue to work (events go to "default" session)
4. **Mixed environment**: Old + new plugins work side-by-side

---

## 12. Constraints & Design Decisions

### 12.1 Technical Constraints

| Constraint | Rationale |
|-----------|-----------|
| No external npm dependencies | Keep extension lean; zero-dependency policy |
| Cross-platform port file | Use `os.homedir()` + `.opencode/` — works on Linux/macOS/Windows |
| UUID v4 for session IDs | Standard, no conflicts, no coordination needed |
| Plugin `fetch` is async | Retry loops must be non-blocking |
| No `fs` access from plugin | Plugin only has `fetch`; reads port file via... **Wait** — plugin runs in Node.js environment, so it HAS access to `fs` and `process.env`. Actually, opencode plugins are JavaScript modules that run in the opencode process, which is Node.js. So they CAN use `require('fs')` to read files. This is critical. |

**Clarification on Plugin Capabilities:** opencode plugins run in Node.js and have access to:
- `fetch` (built-in)
- `require('fs')` for file I/O
- `process.env` for environment variables
- `require('path')` for path operations
- `require('crypto')` for UUID generation

So the plugin CAN read `~/.opencode/dashboard.json` using `fs.readFileSync()`.

### 12.2 Design Decisions

| Decision | Rationale |
|----------|-----------|
| **File-based port discovery** over environment variables | File is persistent, survives process restarts, works cross-platform |
| **`~/.opencode/dashboard.json`** as port file location | OpenCode convention: `~/.opencode/` is opencode's config directory |
| **Session ID in plugin** over server-assigned | Each plugin instance generates its own ID; no server coordination needed |
| **Server-side session cleanup** (5min timeout) | Prevents unbounded memory growth; 5min gives enough time for terminals that are briefly idle |
| **UUID v4** over sequential IDs | No conflicts even with many terminals; no server needed for ID generation |
| **`GET /sessions`** as a REST endpoint over SSE | Simpler polling for the QuickPick use case; sessions change infrequently |
| **QuickPick** over dropdown in Webview | VSCode-native UX; consistent with other VSCode interactions |
| **WorkspaceState persistence** over settings.json | Survives VSCode restart; doesn't pollute user's settings |
| **"default" session** for backward compat | Old plugins work without any changes |

### 12.3 Security Considerations

- **`~/.opencode/dashboard.json`** contains no sensitive information (just port number)
- **SSE streams** are localhost-only (server binds to `127.0.0.1`)
- **Session IDs** are UUIDs — unguessable, but in localhost context, this is sufficient
- **No authentication** for HTTP endpoints (localhost-only)

### 12.4 Error Handling

| Scenario | Handling |
|----------|----------|
| Port file not writable | Extension logs warning, continues without port file |
| Port file stale (extension crash) | Plugin reads stale port, POST fails, re-reads, falls back to default |
| Plugin can't reach server | Silently fail (catch in `send()`) — plugin continues to work |
| Server can't start on any port | Extension shows warning, no event tracking |
| All ports in range (3001-3010) busy | Extension reports error, does not start |

### 12.5 Performance Considerations

- **Session map** bounded by ~5 minutes of idle sessions; typical max: 10-20 entries
- **SSE heartbeat** every 30s to prevent proxy timeouts
- **Plugin retry** has exponential backoff capped at 8s to avoid hammering
- **Port file reads** are on plugin load only; no repeated file I/O
- **Session cleanup** runs every 60s — negligible CPU impact

---

## 13. Implementation Phases

### Phase 1: Port Discovery + Session Identity (P0)
**Files to create/modify:**
- `src/utils/portFile.js` — NEW
- `src/server/eventServer.js` — Update to session map
- `.opencode/plugins/dashboard.js` — Add port discovery + session_id
- `src/extension.ts` — Write/remove port file

### Phase 2: Session Selection (P0)
**Files to create/modify:**
- `src/panel/sessionManager.ts` — NEW (QuickPick logic)
- `src/panel/petsPanel.ts` — Update for session selection
- `src/panel/html/js/main.js` — Update for session filtering

### Phase 3: Backward Compat + Polish (P0)
**Files to modify:**
- `src/server/eventServer.js` — "default" session fallback
- Documentation updates
- Test cases

### Phase 4: Multi-Terminal Tabs (P1 — Future)
**Files to create/modify:**
- `src/panel/html/js/tabBar.js` — NEW
- `src/panel/html/css/tabBar.css` — NEW
- Various updates for tab interaction

---

## 14. Glossary

| Term | Definition |
|------|------------|
| SSE | Server-Sent Events — HTTP-based push protocol |
| Webview | VSCode API for rendering HTML inside a panel |
| Session | A single opencode terminal/process instance, identified by a UUID |
| Session ID | UUID v4 identifying an opencode terminal instance |
| Port file | `~/.opencode/dashboard.json` — contains the extension's listening port |
| "default" session | Fallback session for events without `session_id` (backward compat) |
| QuickPick | VSCode native quick selection dialog |
| SID (Short for Session ID) | The UUID that identifies an opencode terminal |
| Agent | An opencode AI agent (explore, general, ssd-*) |
| Stale session | A session that hasn't sent events for > 5 minutes |
| WorkspaceState | VSCode extension API key-value store (survives restarts) |

---

*End of specification version 2.0*
