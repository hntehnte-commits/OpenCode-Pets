/**
 * OpenCode Pets — Dashboard Plugin
 *
 * Sends opencode agent events to the OpenCode Pets VSCode extension.
 *
 * v2.0 changes:
 *  - Port discovery: reads ~/.opencode/dashboard.json or scans ports 3001-3010
 *  - Session identity: generates UUID v4 session_id, included in all events
 *  - Retry with exponential backoff on connection failure
 *  - Context tracking: detects which sub-agent is active by parsing `task` args
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

// ── Context tracking ──
// Tracks which sub-agent is currently active.
// The orchestrator calls sub-agents via `task`; we detect the agent from the args
// and attribute subsequent tool events to it.
let _currentAgent = null

/**
 * Extract the sub-agent ID from task arguments.
 * opencode task calls typically reference agents in one of these formats:
 *   - { agent: "ssd-planner", prompt: "..." }  (structured)
 *   - "@ssd-planner do X"                        (inline mention)
 *   - { prompt: "@ssd-planner do X" }            (prompt with mention)
 * @param {any} args - The output.args from task tool.execute.before
 * @returns {string|null} Detected agent ID, or null
 */
function extractAgentFromTaskArgs(args) {
  if (!args) return null

  // Case 1: args is an object with explicit agent field
  if (typeof args === 'object' && args.agent) {
    let agentId = args.agent
    // Strip any namespace prefix (e.g., ssd/ssd-planner → ssd-planner)
    if (agentId.includes('/')) {
      agentId = agentId.split('/').pop()
    }
    return agentId
  }

  // Case 2: args is an object with agent as first array element
  if (Array.isArray(args) && args.length > 0 && typeof args[0] === 'string') {
    const candidate = args[0].replace(/^@/, '').split('/').pop()
    if (isValidAgentId(candidate)) return candidate
  }

  // Case 3: stringify and look for @agent-name pattern
  let text = ''
  if (typeof args === 'string') {
    text = args
  } else if (typeof args === 'object') {
    text = args.name || args.prompt || JSON.stringify(args)
  }

  const agentMatch = text.match(/@([a-zA-Z][a-zA-Z0-9_\/-]+)/)
  if (agentMatch) {
    // Strip any namespace prefix (e.g., ssd/ssd-planner → ssd-planner)
    return agentMatch[1].replace(/^[^/]+\//, '')
  }

  return null
}

/** Known agent IDs for validation */
const KNOWN_AGENTS = [
  'explore', 'general',
  'ssd-planner', 'ssd-spec-writer', 'ssd-implementer',
  'ssd-tester', 'ssd-reviewer', 'ssd-docs-writer',
  'ssd-validator', 'ssd-orchestrator',
]

function isValidAgentId(id) {
  return KNOWN_AGENTS.includes(id)
}

// ── Tool-to-agent mapping ──
// Used as fallback when context tracking doesn't know which agent is active.
// Each tool maps to the most likely agent that uses it.
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

/**
 * Resolve the agent ID for a tool event.
 * Priority: 1) context-tracked agent  2) TOOL_AGENT_MAP  3) 'general'
 * @param {string} tool - The tool name
 * @returns {string} Resolved agent ID
 */
function resolveAgent(tool) {
  return _currentAgent || TOOL_AGENT_MAP[tool] || 'general'
}

// ── Plugin Export ──
export const DashboardPlugin = async () => {
  send('plugin.loaded', { agent: 'ssd-orchestrator', terminal: TERMINAL_LABEL })

  return {
    'tool.execute.before': async (input, output) => {
      // When orchestrator delegates to a sub-agent via task, detect which one
      if (input.tool === 'task') {
        const detected = extractAgentFromTaskArgs(output.args)
        if (detected) {
          _currentAgent = detected
          // Immediately send a session.thinking to show the sub-agent as active
          send('session', {
            type: 'session.thinking',
            agent: detected,
          })
        }
        // Debug: log what we detected (visible in VSCode debug console or terminal)
        console.log('[Pets Plugin] task called, args:', JSON.stringify(output.args), 'detected agent:', detected, 'session:', SESSION_ID)
      }

      // Also listen for session.thinking in event handler — it may set _currentAgent
      const agent = resolveAgent(input.tool)
      send('tool.start', {
        agent,
        tool: input.tool,
        args: output.args,
        detail: agent + ' running ' + input.tool,
      })
    },
    'tool.execute.after': async (input, result) => {
      const agent = resolveAgent(input.tool)
      send('tool.end', {
        agent,
        tool: input.tool,
      })

      // When task finishes, send idle for the sub-agent and clear tracking
      if (input.tool === 'task') {
        if (_currentAgent) {
          send('session', {
            type: 'session.idle',
            agent: _currentAgent,
          })
        }
        _currentAgent = null
      }
    },
    event: async ({ event }) => {
      // Forward session lifecycle events to the dashboard
      if (['session.created', 'session.thinking', 'session.idle', 'session.error'].includes(event.type)) {
        const agent = event.agent || 'ssd-orchestrator'

        // If runtime tells us which agent is thinking, track it
        if (event.agent && event.type === 'session.thinking') {
          _currentAgent = event.agent
          console.log('[Pets Plugin] session.thinking for agent:', event.agent)
        }

        send('session', { type: event.type, agent })
      }
    },
    stop: async () => {
      send('session', { type: 'session.stopped', agent: 'ssd-orchestrator' })
    },
  }
}
