# Module: `src/utils/portFile.js`

**File:** `src/utils/portFile.js`
**Status:** New for v2.0

## Purpose

Provides a cross-platform mechanism for the VSCode extension to publish its actual
listening port so the opencode plugin can discover the correct `eventServer` URL.
Previously the plugin hardcoded `http://localhost:3001/event`, which broke when the
extension fell back to a higher port (3002–3010).

The port file is written to `~/.opencode/dashboard.json` (Linux/Mac) or
`%USERPROFILE%\.opencode\dashboard.json` (Windows).

## Interface

```
~/.opencode/dashboard.json
{
  "port":       <number>,     // Actual listening port
  "pid":        <number>,     // Extension process ID
  "startedAt":  <number>,     // Epoch ms when the file was written
  "version":    1             // Schema version
}
```

## Exports

### `PORT_FILE_PATH: string`

Resolved absolute path to `dashboard.json`. Uses `os.homedir()` + `/.opencode/dashboard.json`
to ensure the same location on all platforms.

### `writePortFile(port: number): Promise<void>`

Writes port information to `~/.opencode/dashboard.json`. Creates the `~/.opencode/`
directory if it does not exist.

- **Parameters:**
  - `port` — The actual listening port returned by `eventServer.start()`
- **Side effects:** Creates `~/.opencode/` (if absent) and writes JSON
- **Called by:** `eventServer.js` after `server.listen()` succeeds

### `readPortFile(): Promise<object | null>`

Reads and parses the port file.

- **Returns:** `{ port, pid, startedAt, version }` if the file exists and `port` is a
  number, or `null` if the file is missing or malformed.
- **Called by:** `dashboard.js` (opencode plugin) via dynamic `import()`

### `removePortFile(): Promise<void>`

Deletes the port file. Succeeds silently if the file does not exist.

- **Called by:** `eventServer.stop()` and `extension.ts deactivate()`

## Error handling

| Scenario | Behaviour |
|----------|-----------|
| `~/.opencode/` does not exist | `writePortFile` creates it (recursive) |
| File missing during read | Returns `null` — plugin falls back to port scan |
| File is corrupt JSON | Returns `null` — plugin falls back to port scan |
| File delete fails (no file) | Caught silently |

## Usage example

```javascript
const { writePortFile, readPortFile, removePortFile } = require('./utils/portFile')

// Extension writes its port after server starts
await writePortFile(3002)

// Plugin reads to discover the correct URL
const data = await readPortFile() // { port: 3002, pid: 12345, ... }
```

## Changes in v2.0

This module is entirely new in v2.0. It solves the **Port Discovery (P0)** issue
where the plugin hardcoded port 3001.

## Backward Compatibility

The module has no impact on existing v1.0 code. The plugin falls back to the default
`http://localhost:3001/event` if the port file is absent, preserving backward
compatibility with old installations and the standalone `multi-agents/tracker/server.js`.

## Reference

- [Implementation Plan](../current/implementation-plan.md) — Phase 0: Port Discovery
- [Specification](../../spec.md) — Section 4.4
