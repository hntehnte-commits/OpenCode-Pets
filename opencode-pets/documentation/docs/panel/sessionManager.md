# Module: `src/panel/sessionManager.ts`

**File:** `src/panel/sessionManager.ts`
**Status:** New for v2.0

## Purpose

Provides session selection state management and QuickPick UI for the
multi-terminal feature. When multiple opencode terminals are active, each
generating its own event stream, the extension needs to let the user choose
which session to watch. `SessionManager` handles:

- Fetching active sessions from the `EventServer`
- Displaying a VSCode QuickPick dialog with session metadata
- Persisting the user's selection in `workspaceState` so it survives
  VSCode restarts
- Formatting relative timestamps for the QuickPick items

## Interface

### `SessionSummary` (interface)

```typescript
export interface SessionSummary {
  id: string           // UUID v4 or "default"
  label?: string       // Human-readable terminal label (if provided)
  lastSeen: number     // Epoch ms of most recent event
  createdAt: number    // Epoch ms of session creation
  agentCount: number   // Number of distinct agents that have sent events
}
```

## Key exports

### `class SessionManager`

#### `constructor(eventServer: EventServer)`
- Stores a reference to the running `EventServer` for session queries

#### `async getActiveSessions(): Promise<SessionSummary[]>`
- Calls `eventServer.getSessions()` which returns sessions with events in the
  last 5 minutes
- Returns an empty array if the call fails (server not reachable)

#### `async showSessionPicker(): Promise<string | null | undefined>`
- Shows a VSCode QuickPick dialog listing all active sessions
- **Returns:**
  - `string` — the selected session ID
  - `null` — user selected "Show All Sessions"
  - `undefined` — user cancelled the dialog
- **Behaviour:**
  - If no sessions are active, shows an information message and returns
    `undefined`
  - Each session item displays:
    - `label`: Terminal icon + label (or truncated UUID if no label)
    - `description`: Agent count + relative time since last event
  - If more than one session exists, adds a "Show All Sessions" option at the
    bottom of the list

#### `getPersistedSession(context): string | null`
- Reads the persisted session ID from `context.workspaceState` under the key
  `opencodePets.selectedSession`
- Returns `null` if no session was previously selected

#### `persistSession(context, sessionId): void`
- Writes the selected session ID to `context.workspaceState`
- Passing `null` persists "show all" mode

#### `isSessionActive(sessionId): boolean`
- Checks whether a given session ID is still present in the server's active
  session list
- Returns `true` if the session exists and has had events within the last
  5 minutes

#### `_formatRelativeTime(timestamp): string` (private)
- Converts an epoch timestamp to a human-readable relative time string:
  - `< 60s` → `"Xs ago"`
  - `< 60m` → `"Xm ago"`
  - `>= 60m` → `"Xh ago"`

## QuickPick item format

Each session is rendered as a `vscode.QuickPickItem`:

```
$(terminal) My Terminal Label     3 agents • active 30s ago
$(terminal) 550e8400-e2…          1 agent  • active 5m ago
─── when sessions.length > 1 ──
$(symbol-event) Show All Sessions View events from all terminals
```

## Dependencies
- `vscode` — VSCode API (`window.showQuickPick`, `window.showInformationMessage`,
  `ExtensionContext.workspaceState`, `QuickPickItem`)
- `../server/eventServer` — `EventServer` class with `getSessions()` method

## Usage example

```typescript
import { SessionManager } from './sessionManager'
import { EventServer } from '../server/eventServer'

const server = new EventServer()
await server.start(3001)

const manager = new SessionManager(server)

// Fetch active sessions
const sessions = await manager.getActiveSessions()
console.log(sessions) // [{ id: '...', label: '...', agentCount: 3, ... }]

// Show QuickPick to the user
const pickedId = await manager.showSessionPicker()
if (pickedId !== undefined) {
  manager.persistSession(context, pickedId)
}

// Restore a previously picked session
const restored = manager.getPersistedSession(context)
if (restored && manager.isSessionActive(restored)) {
  console.log('Session still active:', restored)
}
```

## State management

The `SessionManager` itself is stateless — it delegates all data queries to the
`EventServer` and all persistence to VSCode's `workspaceState`. The only state
is the `eventServer` reference held in the constructor.

## Edge cases

| Scenario | Behaviour |
|----------|-----------|
| No active sessions | Information message shown; returns `undefined` |
| Exactly 1 session | No QuickPick shown in `createOrShow()`; auto-selected |
| 2+ sessions | QuickPick shown with all sessions plus "Show All" |
| User cancels QuickPick | Returns `undefined` — caller takes no action |
| Server not reachable | `getActiveSessions()` returns empty array |
| Previously persisted session gone | `createOrShow` checks `isSessionActive()` — falls through to QuickPick |

## Changes in v2.0

This module is entirely new in v2.0. It was introduced to support the
**Session Identity (P0)** requirement for multi-terminal event streams.

## Acceptance Criteria covered

| ID | Description | Status |
|----|-------------|--------|
| AC5 | QuickPick shown when panel opens with 2+ active sessions | v2.0 |
| AC5b | Selecting a session filters the panel to that session's events | v2.0 |
| AC6b | Session selection persists across VSCode restart (workspaceState) | v2.0 |

## Reference
- [Implementation Plan](../current/implementation-plan.md) — Phase 1: Session Identity
- [Specification](../../spec.md) — Section 4.2
