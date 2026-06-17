# Implementation Plan: OpenCode Pets v2.0 — Multi-Terminal + Port Discovery

**Status:** `COMPLETED`  
**Version:** 2.0  
**Created:** 2026-06-17  
**Completed:** 2026-06-17  
**Owner:** SSD Orchestrator  
**Spec Reference:** [`spec.md`](../../spec.md) (v2.0)

---

## Overview

**OpenCode Pets** is a VSCode extension that provides a real-time pixel-art dashboard showing opencode agent activity. The **v1.0** extension is fully implemented (10 agents, event pipeline, SSE streaming, Webview panel). **v2.0** addresses three critical issues discovered during integration testing:

| Issue | Priority | Description |
|-------|----------|-------------|
| **Port Discovery (P0)** | Blocking | Plugin hardcodes `http://localhost:3001/event`; extension may use fallback port 3002+ when 3001 is busy |
| **Plugin Location (P1)** | High | Plugin lives inside extension `.opencode/plugins/` but opencode loads from *user project's* `.opencode/plugins/` |
| **Session Identity (P0)** | Blocking | All terminals share the same event stream with no way to distinguish them |

### What Already Works (v1.0 — Implemented)

- Extension scaffold with `extension.ts`, `petsPanel.ts`, Webview panel
- 10 unique agent sprites (explore, general, ssd-planner, ssd-spec-writer, ssd-implementer, ssd-tester, ssd-reviewer, ssd-docs-writer, ssd-validator, ssd-orchestrator)
- Each agent has 7 animation states (idle, happy, error, thinking, write, read, bash)
- HTTP/SSE server (`eventServer.js`) on configurable port
- Event pipeline: opencode plugin → POST /event → SSE /stream → Webview panel
- Per-agent state queues with 400ms minimum visibility
- Light/dark theme support via VSCode CSS variables
- VSIX packaging (`opencode-pets-1.0.0.vsix`)
- `multi-agents/tracker/server.js` and `track.js` are UNCHANGED and still work independently

### What's Broken / Missing

1. **Port hardcoded**: `dashboard.js` has `const SERVER = 'http://localhost:3001/event'` — extension may be on 3002+ if 3001 is in use
2. **Plugin not loaded**: `dashboard.js` lives at `opencode-pets/.opencode/plugins/` but opencode loads from user project's `.opencode/plugins/`
3. **No session identity**: All opencode terminals post to same server, events mix together

---

## Architecture (v2.0)

```
                    ┌─────────────────────────────────────────────┐
                    │         VSCode Extension Host                │
                    │                                             │
                    │  extension.ts                               │
                    │    ├─ start eventServer (port N)             │
                    │    ├─ writePortToFile(N)  ← NEW             │
                    │    ├─ copyPluginToUserDir()  ← NEW          │
                    │    └─ register commands (+selectSession)     │
                    │                                             │
                    │  eventServer.js  (UPDATED)                  │
                    │    ├─ _sessions: Map<sessionId, state>      │
                    │    ├─ POST /event → routes by session_id    │
                    │    ├─ GET /sessions  ← NEW                  │
                    │    ├─ GET /stream?session=<id>  ← UPDATED   │
                    │    └─ periodic cleanup (5min stale)         │
                    │                                             │
                    │  petsPanel.ts  (UPDATED)                    │
                    │    ├─ fetch active sessions on open          │
                    │    ├─ QuickPick if ≥2 sessions  ← NEW       │
                    │    └─ command: selectSession  ← NEW         │
                    │                                             │
                    │  sessionManager.ts  ← NEW                   │
                    │    └─ session selection + persistence        │
                    └─────────────────────────────────────────────┘
                              ▲                    │
                              │                    │ POST /event
                              │ read dashboard.json│ + session_id
                              │                    ▼
                    ┌─────────┴────────────────────────────────────┐
                    │  opencode plugin (dashboard.js)  UPDATED      │
                    │  ├─ readPortFromFile() → dashboard.json      │
                    │  ├─ generateSessionId() → UUID v4            │
                    │  └─ sends { type, data, time, session_id }   │
                    └──────────────────────────────────────────────┘
```

### Key New/Changed Files

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/utils/portFile.js` | **NEW** | Read/write `~/.opencode/dashboard.json` for port discovery |
| `src/server/eventServer.js` | **UPDATED** | Session map replaces single state; `/sessions` endpoint; cleanup timer |
| `.opencode/plugins/dashboard.js` | **UPDATED** | Port discovery + session_id generation |
| `src/panel/petsPanel.ts` | **UPDATED** | Session QuickPick dialog on panel open |
| `src/panel/sessionManager.ts` | **NEW** | Session selection state + QuickPick UI |
| `src/panel/html/js/main.js` | **UPDATED** | Filter events by selected session_id |
| `src/panel/html/js/state.js` | **UPDATED** | Accept session_id in processEvent() |
| `src/extension.ts` | **UPDATED** | Write port file on start, delete on stop; register selectSession command |

---

## Implementation Phases

### Phase 0: Port Discovery + Plugin Auto-Install (P0 — Blocking)

**Goal:** Plugin automatically discovers the extension's server port; plugin is auto-copied so opencode loads it.

#### Files to create/modify:

**1. `src/utils/portFile.js`** (NEW)
- `writePortFile(port)` → writes to `~/.opencode/dashboard.json`
- `readPortFile()` → reads port from file, returns null if absent
- `removePortFile()` → delete file on deactivation
- Cross-platform path resolution: `os.homedir() + '/.opencode/dashboard.json'`

**2. `src/extension.ts`** (UPDATED)
- After `eventServer.start()` succeeds → call `writePortFile(port)`
- On `deactivate()` → call `removePortFile()`
- On activate → copy plugin from extension dir to user's `.opencode/plugins/` (or document the path)

**3. `.opencode/plugins/dashboard.js`** (UPDATED)
- Remove hardcoded `SERVER = 'http://localhost:3001/event'`
- Add `readPortFromFile()` → reads `~/.opencode/dashboard.json`
- Add `discoverServerUrl()` → returns port from file or falls back to `http://localhost:3001/event`
- Add retry with exponential backoff (500ms → 1s → 2s → 4s → 8s, max 5 retries)
- Add `generateUUID()` → UUID v4 for session identity

**4. `src/server/eventServer.js`** (UPDATED — partial)
- On successful `start()` → call `writePortFile(port)`
- On `stop()` → call `removePortFile()`

**Deliverable:** Plugin auto-discovers port; events flow even when 3001 is taken.

### Phase 1: Session Identity + Terminal Selector (P0)

**Goal:** Each opencode terminal gets its own session; user can select which session to watch.

#### Files to modify/create:

**1. `src/server/eventServer.js`** (UPDATED — session tracking)
- Replace `_current` state with `_sessions: Map<sessionId, SessionState>`
- `POST /event`: extract `session_id` from body, route to per-session state
- `GET /sessions`: return list of active sessions (with agent count, lastSeen)
- `GET /stream?session=<id>`: filter SSE events by session (or pass all if no filter)
- If no `session_id` in event → route to `"default"` session (backward compat)
- Periodic cleanup: every 60s, remove sessions idle > 5 minutes

**2. `src/panel/sessionManager.ts`** (NEW)
- `getActiveSessions()` → fetch from event server
- `showSessionPicker()` → VSCode QuickPick with session list
- `getPersistedSession()` / `persistSession()` → workspaceState persistence

**3. `src/panel/petsPanel.ts`** (UPDATED)
- `createOrShow()`: fetch sessions, show QuickPick if ≥2 active
- `selectSession()` command: re-show QuickPick to switch session
- Pass `selectedSessionId` to Webview via postMessage

**4. `src/panel/html/js/main.js`** (UPDATED)
- Accept `sessionSelected` message → filter events by session_id
- Accept `sessions` message → update session indicator in header
- Add session indicator click handler → triggers `selectSession` command

**5. `src/panel/html/js/state.js`** (UPDATED)
- `processEvent()` optionally accepts `sessionId` parameter
- State queues remain per-agent but respect session filtering

**Deliverable:** Multi-terminal support with session selection dialog.

### Phase 2: Documentation + Auto-Install Polish (P1)

**Goal:** Production-quality docs, validation tests, and plugin auto-install.

- Module docs: `documentation/docs/plugin/dashboard.md`, `documentation/docs/server/eventServer.md`, etc.
- Validation test cases: `documentation/test_cases/` for each changed module
- Test: extension with old `track.js` still works (backward compat)
- Test: extension with new `dashboard.js` on port 3001 works
- Test: extension on fallback port (3002+) works with new plugin
- Test: 2+ terminals create separate sessions
- Test: session selector QuickPick shows and works

### Phase 3: Multi-Terminal Tabs (P1 — Future)

**Goal:** Tab bar showing all sessions simultaneously.

**Deliverable:** Not in scope for v2.0. Reserved for v3.0.

---

## Acceptance Criteria

| ID | Criterion | Phase |
|----|-----------|-------|
| AC1 | Extension writes `~/.opencode/dashboard.json` with correct port on server start | 0 |
| AC1b | Extension deletes port file on deactivation | 0 |
| AC2 | Plugin reads port from file, falls back to 3001 if absent | 0 |
| AC2b | Plugin retries with backoff when port file missing | 0 |
| AC3 | Plugin generates unique UUID v4 session_id on each load | 1 |
| AC3b | All events from a plugin instance include `session_id` | 1 |
| AC4 | Events with different session_ids create separate session states on server | 1 |
| AC4b | Server `/sessions` endpoint returns active sessions list | 1 |
| AC5 | QuickPick shown when panel opens with ≥2 active sessions | 1 |
| AC5b | Selecting a session filters the panel to that session's events | 1 |
| AC6 | Panel session indicator shows current session; click reopens QuickPick | 1 |
| AC6b | Session selection persists across VSCode restart (workspaceState) | 1 |
| AC7 | Events without `session_id` (old track.js) route to "default" session | 1 |
| AC8 | Plugin works when loaded from user project's `.opencode/plugins/` directory | 0 |
| AC9 | All existing v1 functionality continues to work (10 agents, animations, SSE) | All |

---

## Dependencies

### Runtime (zero new dependencies)
- Node.js built-in `http`, `fs`, `path`, `os` modules
- VSCode API (`vscode` namespace)
- Browser Canvas 2D API (Webview)

### Dev Dependencies (unchanged from v1)
| Package | Version | Purpose |
|---------|---------|---------|
| `@types/vscode` | ^1.85.0 | VSCode API types |
| `typescript` | ^5.3.0 | TypeScript compilation |
| `@vscode/vsce` | ^2.22.0 | VSIX packaging |

---

## Backward Compatibility

| Component | Impact |
|-----------|--------|
| `multi-agents/tracker/server.js` | Unchanged — still works on port 3001 |
| `.opencode/plugins/track.js` | Unchanged — events go to "default" session |
| `multi-agents/` browser dashboard | Fully operational alongside extension |
| v1.0 extension behavior | Plugin auto-discovers; old behavior is fallback path |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Port file race: plugin reads before extension writes | Exponential backoff retry (max 5 attempts) |
| VSCode crashes, port file left on disk | Plugin POST fails → re-reads → fallback to 3001; next extension start overwrites file |
| No `session_id` in existing events (track.js) | Routed to "default" session — transparent backward compat |
| QuickPick adds friction for single-session users | Skip QuickPick when only 1 session active |
| Session cleanup removes session during active use | 5-minute stale timeout; cleanup runs every 60s |

---

## Test Plan

| ID | Phase | Test | Method |
|----|-------|------|--------|
| T1 | 0 | Extension writes port file on activation | Check `~/.opencode/dashboard.json` exists |
| T2 | 0 | Plugin reads port file and sends to correct URL | Server logs show events received |
| T3 | 0 | Port fallback: 3001 busy → extension on 3002 | Port file shows port 3002; plugin sends to 3002 |
| T4 | 0 | Retry: plugin starts before extension | Plugin logs retry then success |
| T5 | 0 | Plugin auto-copy to user's `.opencode/plugins/` | File exists in user project dir |
| T6 | 1 | Two terminals → two sessions | `GET /sessions` returns 2 entries |
| T7 | 1 | Session QuickPick shown with ≥2 sessions | Visual confirmation |
| T8 | 1 | Selected session filters events | Only selected session's agents animate |
| T9 | 1 | Session persists after VSCode restart | Reopen panel → same session selected |
| T10 | 1 | Old track.js still works | Events in "default" session |
| T11 | 1 | Session cleanup: stop terminal → session removed after 5min | `GET /sessions` no longer shows it |
| T12 | All | All 10 agents render and animate | Visual |
| T13 | All | Light/dark theme support | Visual |

---

## Review & Approval

**This plan is ready for review.**

The implementation is divided into phases:
- **Phase 0**: Port Discovery + Plugin Auto-Install (unblocks the broken pipeline)
- **Phase 1**: Session Identity + Terminal Selector (multi-terminal support)
- **Phase 2**: Documentation + Validation Tests (quality gate)
- **Phase 3**: Multi-Terminal Tabs (future, out of scope)

Before any implementation begins, the user must explicitly approve this plan.

To approve, respond: **"Plan approved"** or **"Aprobado"**

To request changes, describe what needs to be modified.
