/**
 * OpenCode Pets — Dashboard Plugin
 *
 * Sends opencode agent events to the OpenCode Pets VSCode extension.
 *
 * v2.0 changes:
 *  - Port discovery: reads ~/.opencode/dashboard.json or scans ports 3001-3010
 *  - Session identity: generates UUID v4 session_id, included in all events
 *  - Retry with exponential backoff on connection failure
 */

// ── Session identity (UUID v4, generated once per plugin load) ──
function generateUUID() {
  // RFC 4122 version 4 UUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const SESSION_ID = generateUUID()
const TERMINAL_LABEL = process.env.OPENCODE_TERMINAL_TITLE || ''

// ── Port Discovery ──
const DEFAULT_SERVER = 'http://localhost:3001/event'
const MAX_RETRIES = 5
const RETRY_BASE_MS = 500

let _discoveredUrl = null

/**
 * Try to read the port from ~/.opencode/dashboard.json.
 * Uses dynamic import() with JSON assertion (ESM-compatible).
 * Falls back gracefully if file or import is unavailable.
 */
async function readPortFromFile() {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE || ''
    if (!homeDir) return null

    // Attempt to read the file via dynamic import (JSON module)
    // This works in Node.js ESM with --experimental-json-modules or Node >= 18
    const filePath = homeDir + '/.opencode/dashboard.json'
    const portFile = await import(filePath, { assert: { type: 'json' } })
    if (portFile && typeof portFile.default?.port === 'number') {
      return portFile.default.port
    }
    return null
  } catch {
    // Dynamic import with file:// may not work in all environments
    return null
  }
}

/**
 * Scan ports 3001-3010 to find the extension's event server.
 * Used as fallback when file-based discovery fails.
 */
async function scanPorts() {
  for (let port = 3001; port <= 3010; port++) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        method: 'GET',
        // Use a short timeout; AbortSignal.timeout is available in modern runtimes
        signal: AbortSignal.timeout(300),
      })
      if (res.ok) {
        return port
      }
    } catch {
      // Port not responding — try next
    }
  }
  return null
}

/**
 * Discover the event server URL.
 * Priority: 1) dashboard.json file  2) port scan  3) default (3001)
 */
async function discoverServerUrl() {
  // 1. Try file-based discovery
  const filePort = await readPortFromFile()
  if (filePort) {
    return `http://localhost:${filePort}/event`
  }

  // 2. Try scanning ports
  const scannedPort = await scanPorts()
  if (scannedPort) {
    return `http://localhost:${scannedPort}/event`
  }

  // 3. Fall back to default
  return DEFAULT_SERVER
}

/**
 * Send an event to the extension's event server.
 * Retries with exponential backoff on failure.
 * On each retry, re-discovers the server URL in case the port changed.
 */
async function send(type, data) {
  // Refresh URL if not yet discovered
  if (!_discoveredUrl) {
    _discoveredUrl = await discoverServerUrl()
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(_discoveredUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data,
          time: Date.now(),
          session_id: SESSION_ID,
          terminal: TERMINAL_LABEL,
        }),
      })
      if (res.ok) return
      // Non-OK response — might be transient, retry
    } catch {
      // Connection error — might be port mismatch, re-discover and retry
      _discoveredUrl = await discoverServerUrl()
    }

    // Wait with exponential backoff before retry
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)))
    }
  }
  // All retries exhausted — silently drop event
}

// ── Tool-to-agent mapping ──
const TOOL_AGENT_MAP = {
  read: 'explore',
  write: 'ssd-implementer',
  edit: 'ssd-implementer',
  bash: 'general',
  grep: 'explore',
  glob: 'explore',
  task: 'ssd-orchestrator',
  todowrite: 'ssd-orchestrator',
  skill: 'ssd-orchestrator',
}

// ── Plugin Export ──
export const DashboardPlugin = async () => {
  send('plugin.loaded', { agent: 'ssd-orchestrator', terminal: TERMINAL_LABEL })

  return {
    'tool.execute.before': async (input, output) => {
      const agent = output.agent || TOOL_AGENT_MAP[input.tool] || 'general'
      send('tool.start', {
        agent,
        tool: input.tool,
        args: output.args,
        detail: agent + ' running ' + input.tool,
      })
    },
    'tool.execute.after': async (input, result) => {
      const agent = result.agent || TOOL_AGENT_MAP[input.tool] || 'general'
      send('tool.end', {
        agent,
        tool: input.tool,
      })
    },
    event: async ({ event }) => {
      // Forward session lifecycle events to the dashboard
      if (['session.created', 'session.thinking', 'session.idle', 'session.error'].includes(event.type)) {
        const agent = event.agent || 'ssd-orchestrator'
        send('session', { type: event.type, agent })
      }
    },
    stop: async () => {
      send('session', { type: 'session.stopped', agent: 'ssd-orchestrator' })
    },
  }
}
