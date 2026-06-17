# Module: `src/panel/petsPanel.ts`

**File:** `src/panel/petsPanel.ts`
**Status:** Updated for v2.0 (session selection QuickPick, async lifecycle)

## Purpose

Manages the VSCode `WebviewPanel` for the OpenCode Pets dashboard. Creates or
reveals the panel, assembles the HTML with inlined JS/CSS (using file reads and
placeholder replacement), relays events from the `EventServer` to the Webview
via `postMessage`, and provides a session selection dialog when multiple
opencode terminals are active.

## Data flow

```
extension.ts: PetsPanel.createOrShow(eventServer, context)
    │
    ▼
petsPanel.ts: static async createOrShow()
    │
    ├── Panel already exists? → reveal() it (retainContextWhenHidden preserves JS state)
    │
    ├── NEW: Determine session to track:
    │     ├── Try restored session from workspaceState
    │     ├── Single active session → auto-select
    │     ├── Multiple active sessions → show QuickPick via SessionManager
    │     └── Persist selection
    │
    └── Create new WebviewPanel:
          ├── viewType: 'opencodePets.panel'
          ├── title: 'OpenCode Pets'
          ├── enableScripts: true
          ├── retainContextWhenHidden: true
          │
          └── new PetsPanel(panel, eventServer, context, selectedSessionId)
                │
                ├── _getHtmlContent() → reads pets.html, theme.css, all JS files
                │     └── Replaces {{nonce}}, {{port}}, {{THEME_CSS}}, {{PALETTE_JS}},
                │          {{SPRITES_JS}}, {{STATE_JS}}, {{RENDERER_JS}}, {{MAIN_JS}}
                │
                ├── postMessage { type: 'sessionSelected', sessionId }
                │
                ├── panel.webview.onDidReceiveMessage → handles:
                │     ├── 'ready' → re-send session selection
                │     └── 'selectSession' → trigger session QuickPick
                │
                └── eventServer.onEvent(callback) → forwards events via postMessage
                      └── { type: 'event', data: state, time, sessionId, eventId }
```

## Key exports / functions

### `class PetsPanel`

#### `static currentPanel: PetsPanel | undefined`
- Tracks the singleton panel instance

#### `static createOrShow(eventServer, context): Promise<void>` (NOW ASYNC)
- **Parameters:**
  - `eventServer` — The running `EventServer` instance
  - `context` — VSCode `ExtensionContext` for disk paths and workspaceState
- **Behaviour:**
  - If `currentPanel` exists, reveals it and returns (does not reassign HTML)
  - **NEW:** Queries `SessionManager` to determine which session to track:
    1. Checks `workspaceState` for a previously selected session
    2. If restored session is still active, selects it
    3. Otherwise fetches active sessions from the server
    4. If exactly 1 session, auto-selects it (no QuickPick shown)
    5. If 2+ sessions, shows a QuickPick dialog via `sessionManager.showSessionPicker()`
    6. Persists the selection via `sessionManager.persistSession()`
  - Creates a new `WebviewPanel` and passes `selectedSessionId` to the constructor
- **Side effects:** Creates or reveals the panel; shows QuickPick if needed

#### `static selectSession(eventServer, context?): Promise<void>` (NEW)
- **Added in v2.0.** Re-opens the session QuickPick to let the user switch to a
  different session.
- **Behaviour:**
  - Creates a `SessionManager` instance and calls `showSessionPicker()`
  - If the user picks a session (or "Show All"), persists the choice in
    `workspaceState` and sends a `sessionSelected` message to the Webview
  - If the user cancels, does nothing
- **Command:** Registered as `opencode-pets.selectSession` in `extension.ts`

#### `dispose(): void`
- Clears `currentPanel`, disposes the WebviewPanel and all disposables

#### `private constructor(panel, eventServer, context, selectedSessionId)`
- **v2.0 change:** Constructor now accepts and stores `selectedSessionId`
- Sets `panel.webview.html` via `_getHtmlContent()`
- **NEW:** Immediately sends `sessionSelected` postMessage to the Webview
- Registers `onDidReceiveMessage` handler:
  - `'ready'` — re-sends session selection (handles Webview reload)
  - `'selectSession'` — user clicked session indicator; opens QuickPick
- Subscribes to `eventServer.onEvent()` for forwarding state changes
- Registers `panel.onDidDispose` → `this.dispose()`

#### `private _getHtmlContent(context, eventServer): string`
- Reads files from disk and replaces placeholders (unchanged from v1.0)

#### `private _getFallbackHtml(nonce): string`
- Returns minimal HTML with error message and CSP headers (unchanged)

#### `private _getNonce(): string`
- Generates a 64-character random string (unchanged)

## Dependencies
- `vscode` — VSCode API (`window.createWebviewPanel`, `WebviewPanel`, `ThemeIcon`)
- `path` — Node.js path resolution
- `fs` — Node.js file system (readFileSync)
- `../server/eventServer` — `EventServer` class for callbacks
- `./sessionManager` — `SessionManager` class for session selection and persistence

## Usage example

```typescript
// Called from extension.ts activate()
PetsPanel.createOrShow(eventServer, context)

// Command handler to switch sessions
vscode.commands.registerCommand('opencode-pets.selectSession', () => {
  PetsPanel.selectSession(eventServer, context)
})
```

## State management
- `PetsPanel.currentPanel` — static singleton reference
- `_selectedSessionId: string | null` — the currently tracked session (null = show all)
- `_sessionManager: SessionManager` — handles QuickPick and persistence

## Changes in v2.0

| Change | Description |
|--------|-------------|
| `createOrShow()` is now `async` | Must `await` session queries and QuickPick |
| Session selection logic | Determines session before creating panel |
| `selectSession()` static method | **New.** Command handler for switching sessions |
| `_selectedSessionId` field | Tracks the currently selected session |
| `_sessionManager` field | Delegates session management to `SessionManager` |
| `sessionSelected` postMessage | Sent on construction and on session switch |
| `'selectSession'` message handler | Webview click → re-opens QuickPick |

## Backward Compatibility

- Single-session scenarios work exactly like v1.0: no QuickPick is shown
- If the server has no sessions, the panel opens without filtering (show all)
- The `retainContextWhenHidden: true` flag preserves canvas state when switching
  between panels or views

## Acceptance Criteria covered

| ID | Description | Status |
|----|-------------|--------|
| AC5 | QuickPick shown when panel opens with 2+ active sessions | v2.0 |
| AC5b | Selecting a session filters the panel to that session's events | v2.0 |
| AC6 | Session indicator shows current session; click reopens QuickPick | v2.0 |
| AC6b | Session selection persists across VSCode restart (workspaceState) | v2.0 |

## Reference
- [Implementation Plan](../current/implementation-plan.md) — Phase 1: Session Identity
- [Specification](../../spec.md) — Section 4.2
