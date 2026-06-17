# Module: `src/panel/html/js/main.js`

## Purpose
Webview initialization and bootstrap script. Acquires the VSCode API, connects to the SSE event stream (with postMessage fallback), creates the agent grid DOM elements, and starts the `requestAnimationFrame` animation loop.

## Data flow
```
DOMContentLoaded
    │
    ├── acquireVsCodeApi()  (may fail if not in VSCode host)
    │
    ├── Read port from <meta name="port"> tag
    │
    ├── Post { type: 'ready' } to extension host
    │
    ├── Create agent cells:
    │     For each agent in AGENTS[] (from sprites.js):
    │       - Create .agent-cell div
    │       - Call createRenderer(agent.id, cell)
    │       - Add .agent-label and .state-label spans
    │
    ├── startAnimation()  → begins rAF loop (renderer.js)
    │
    ├── connectSSE()  → EventSource('http://localhost:{port}/stream')
    │     └── onmessage → handleEventData(JSON.parse(e.data))
    │     └── onerror   → enable postMessage fallback, retry with backoff
    │     └── onopen    → reset backoff, disable fallback
    │
    └── window.addEventListener('message')
          ├── 'event'  → processEvent (only if fallback mode)
          ├── 'theme'  → toggle .vscode-light class on body
          └── 'agents' → reserved for future dynamic agent additions
```

## Key exports / functions

All functions are IIFE-local (not exported globally).

### `connectSSE()`
- **Purpose**: Establish SSE connection to the embedded event server
- **Inputs**: Reads `port` variable (from `<meta name="port">`)
- **Behavior**:
  - Creates `EventSource` at `http://localhost:{port}/stream`
  - `onmessage`: Parses JSON, calls `handleEventData()`
  - `onerror`: Closes connection, sets `usePostMessageFallback = true`, retries with exponential backoff (1s → 2s → 4s → 5s max)
  - `onopen`: Resets `retryDelay` to 1s, clears fallback flag
  - On `EventSource` constructor failure: Same backoff retry
- **Side effects**: Modifies `eventSource`, `usePostMessageFallback`, `retryDelay`, `retryTimer`

### `handleEventData(data)`
- **Purpose**: Process incoming event data with deduplication
- **Inputs**: `data` object with `{ current: { state, agent, tool, detail }, time }`
- **Behavior**:
  - Timestamp-based dedup: skips if `data.time` ≤ `lastEventTime`
  - Updates `lastEventTime`
  - Calls `processEvent(data)` from state.js
- **Side effects**: Updates `lastEventTime`

## Global variables (IIFE-scoped)

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `vscode` | object or null | `null` | Acquired VSCode API handle |
| `port` | number | `3001` | Server port from meta tag |
| `eventSource` | EventSource or null | `null` | SSE connection handle |
| `lastEventTime` | number | `0` | Dedup timestamp |
| `usePostMessageFallback` | boolean | `false` | Whether to use postMessage event relay |
| `retryDelay` | number | `1000` | SSE retry delay (ms), with backoff |
| `retryTimer` | number or null | `null` | setTimeout ID for retry |

## Dependencies
- `renderer.js` — `createRenderer()`, `startAnimation()`
- `state.js` — `processEvent()`
- `sprites.js` — `AGENTS[]` array, `getSprite()`
- **DOM**: Expects `<meta name="port">`, `#pet-grid`, `#agentCount`, `#eventDetail` elements

## Usage example
```javascript
// main.js is an IIFE — runs automatically on DOMContentLoaded
// No manual invocation needed.
```

## State management
- Maintains SSE connection state (connected/fallback/retrying)
- Event deduplication timestamp
- Retry state machine with exponential backoff

## Edge cases
- **Not running in VSCode**: `acquireVsCodeApi()` throws; gracefully degrades (SSE still works for browser testing)
- **SSE connection failure**: Falls back to `postMessage` relay from the extension host; retries SSE with backoff
- **Rapid events**: Timestamp dedup prevents duplicate processing
- **No agents defined**: Falls back to a single default robot agent `[{ id: 'robot', name: 'Robot' }]`

## Acceptance Criteria covered
- **AC1**: Panel loads and shows agents on command
- **AC5**: SSE connection established, events processed by state.js

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 10
- [Specification](../../../spec.md) — §4.10 `main.js`
