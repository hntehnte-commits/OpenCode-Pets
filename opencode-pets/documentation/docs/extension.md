# Module: `src/extension.ts`

**File:** `src/extension.ts`
**Status:** Updated for v2.0 (port file, plugin copy, session command)

## Purpose
Extension entry point for VSCode. Activates the extension, starts the embedded
event server, writes port discovery file so the opencode plugin can find the
server, copies the plugin to the user's `.opencode/plugins/` directory,
registers the `opencode-pets.showPanel` and `opencode-pets.selectSession`
commands, and manages extension lifecycle (activate/deactivate).

## Data flow
```
VSCode activates extension
    │
    ▼
extension.ts: activate()
    │
    ├── copyPluginToUserDir()         ← NEW: copies dashboard.js to ~/.opencode/plugins/
    │
    ├── Creates new EventServer instance
    ├── Reads opencodePets.serverPort from VSCode config (default 3001)
    ├── Starts server (with port fallback 3001→3010 if busy)
    │     └── Server writes ~/.opencode/dashboard.json  ← NEW: port discovery
    │
    ├── Registers command 'opencode-pets.showPanel'
    │     └── On invocation → PetsPanel.createOrShow(eventServer, context)
    │
    ├── Registers command 'opencode-pets.selectSession'  ← NEW
    │     └── On invocation → PetsPanel.selectSession(eventServer, context)
    │
    ▼
extension.ts: deactivate()
    ├── Stops eventServer (removes port file)
    ├── removePortFile()             ← NEW: explicit cleanup
    └── Disposes PetsPanel.currentPanel
```

## Key exports / functions

### `activate(context: vscode.ExtensionContext): void`
- **Called by**: VSCode runtime (from `package.json` activationEvents)
- **Parameters**:
  - `context` — VSCode `ExtensionContext` for subscription management
- **Side effects**:
  - Copies `dashboard.js` plugin to `~/.opencode/plugins/` for opencode discovery
  - Creates a global `EventServer` instance
  - Starts the HTTP/SSE server on the configured port (with fallback)
  - Server automatically writes port to `~/.opencode/dashboard.json`
  - Registers command `opencode-pets.showPanel`
  - Registers command `opencode-pets.selectSession` (session switching QuickPick)
- **Error handling**: If the server fails to start, a warning message is shown to the user (does not prevent the extension from loading). Plugin copy failures are logged but do not block activation.

### `deactivate(): void`
- **Called by**: VSCode runtime when the extension is deactivated
- **Side effects**:
  - Calls `eventServer.stop()` to close all SSE connections, stop the HTTP server, and remove the port file
  - Calls `removePortFile()` explicitly as a safety net
  - Calls `PetsPanel.currentPanel.dispose()` to clean up the Webview panel

### `copyPluginToUserDir(extensionPath: string): Promise<void>` (NEW)
- **Added in v2.0.** Copies `dashboard.js` from the extension's own
  `.opencode/plugins/` directory to `~/.opencode/plugins/` so the opencode
  runtime can discover and load it.
- Creates `~/.opencode/plugins/` if it does not exist.
- Failures are logged but do not block activation.

## Dependencies
- `vscode` — VSCode Extension API (`window.createWebviewPanel`, `commands.registerCommand`, etc.)
- `fs` — Node.js file system (for plugin copy)
- `path` — Node.js path resolution
- `./server/eventServer` — `EventServer` class for embedded HTTP/SSE server
- `./panel/petsPanel` — `PetsPanel` class for Webview panel management
- `./utils/portFile` — `writePortFile`, `removePortFile` (port discovery)

## Usage example
```typescript
// VSCode calls activate() automatically based on activationEvents in package.json
export function activate(context: vscode.ExtensionContext): void {
  // Server starts, plugin copied, commands registered — all automatic
}
```

## State management
- Holds a module-level `let eventServer: EventServer` reference (global to the extension)
- The `PetsPanel.currentPanel` static property tracks the active panel instance

## Edge cases
- **Port in use**: `EventServer.start()` tries ports 3001→3010; if all busy, an error is caught and displayed via `vscode.window.showWarningMessage`
- **Plugin copy fails**: Extension continues loading; user may need to manually copy the plugin
- **No active text editor**: `PetsPanel.createOrShow` falls back to `vscode.ViewColumn.One`
- **Double activation**: Safe because `PetsPanel.createOrShow` checks `currentPanel` before creating a new one

## Changes in v2.0

| Change | Description |
|--------|-------------|
| `copyPluginToUserDir()` | Automatically copies `dashboard.js` to `~/.opencode/plugins/` |
| Port file integration | Server writes port on start; `deactivate()` removes the file |
| `selectSession` command | New command for switching tracked sessions |
| Import from `portFile` | `writePortFile`, `removePortFile` used in lifecycle |

## Acceptance Criteria covered
- **AC1**: Extension activates and shows Webview panel via `opencode-pets.showPanel` command
- **AC1b**: Extension deletes port file on deactivation
- **AC7**: Extension deactivates cleanly (server stops, port file removed, panel disposes)
- **AC8**: Plugin copied to user's `.opencode/plugins/` directory

## Reference
- [Implementation Plan](../current/implementation-plan.md) — Phase 0 + Phase 1
- [Specification](../../spec.md) — §4.1 `extension.ts`
