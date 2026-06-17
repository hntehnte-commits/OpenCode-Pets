const http = require('http')
const { writePortFile, removePortFile } = require('../utils/portFile')

class EventServer {
  constructor() {
    this._server = null
    this._clients = new Set()
    this._current = { state: 'idle', agent: null, tool: '', detail: '' }
    this._sessions = new Map()      // sessionId → SessionState  (Phase 1)
    this._callbacks = []
    this._port = 3001
    this._cleanupInterval = null
  }

  /**
   * Start the HTTP/SSE server on the given port.
   * If the port is in use, tries the next port up to 3010.
   * @param {number} [port=3001]
   * @returns {Promise<number>} Resolves with the actual port
   */
  start(port) {
    port = port || 3001
    this._port = port

    return new Promise((resolve, reject) => {
      const tryPort = (p) => {
        this._server = http.createServer((req, res) => {
          // ── POST /event — receive events from opencode plugin ──
          if (req.method === 'POST' && req.url === '/event') {
            let body = ''
            req.on('data', (c) => { body += c })
            req.on('end', () => {
              try {
                const event = JSON.parse(body)
                const sessionId = event.session_id || 'default'
                const agentState = this._stateFromEvent(event)

                // Track per-session state (Phase 1 foundation)
                this._updateSession(sessionId, agentState, event.data?.terminal || '')

                // Update legacy _current for backward compat
                this._current = agentState

                this._broadcast({ ...agentState, sessionId })
                this._notifyCallbacks(agentState)
                res.writeHead(200, { 'Content-Type': 'text/plain' })
                res.end('ok')
              } catch {
                res.writeHead(400, { 'Content-Type': 'text/plain' })
                res.end('bad')
              }
            })
            return
          }

          // ── GET /stream — SSE endpoint for Webview ──
          if (req.url.startsWith('/stream')) {
            const url = new URL(req.url, `http://localhost:${p}`)
            const filterSessionId = url.searchParams.get('session') || null

            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            })

            // Send initial state
            const initState = filterSessionId && this._sessions.has(filterSessionId)
              ? { current: this._getSessionState(filterSessionId), sessionId: filterSessionId }
              : { current: this._current }
            res.write(`data: ${JSON.stringify(initState)}\n\n`)

            // Track client with its filter
            const client = { res, filterSessionId }
            this._clients.add(client)
            req.on('close', () => {
              this._clients.delete(client)
            })
            return
          }

          // ── GET /sessions — list active sessions (Phase 1) ──
          if (req.url === '/sessions') {
            const sessions = this.getSessions()
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(JSON.stringify({ sessions }))
            return
          }

          // ── Fallback ──
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OpenCode Pets Event Server')
        })

        let retrying = false
        this._server.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && p < 3010 && !retrying) {
            retrying = true
            const oldServer = this._server
            this._server = null
            oldServer.close(() => tryPort(p + 1))
          } else {
            reject(err)
          }
        })

        this._server.listen(p, async () => {
          this._port = p

          // Write port to ~/.opencode/dashboard.json for plugin discovery
          try {
            await writePortFile(p)
          } catch (err) {
            console.warn('[EventServer] Failed to write port file:', err.message)
          }

          // Start periodic session cleanup (every 60s)
          this._startCleanup()

          resolve(p)
        })
      }

      tryPort(port)
    })
  }

  /**
   * Stop the server and close all SSE connections.
   */
  stop() {
    this._stopCleanup()

    for (const c of this._clients) {
      try { c.end() } catch { /* ignore */ }
    }
    this._clients.clear()
    if (this._server) {
      this._server.close()
      this._server = null
    }
    // Remove port file so plugin knows server is gone
    removePortFile().catch(() => {})
  }

  /**
   * Start periodic cleanup of stale sessions (idle > 5 minutes).
   * @private
   */
  _startCleanup() {
    if (this._cleanupInterval) return
    this._cleanupInterval = setInterval(() => {
      const STALE_MS = 5 * 60 * 1000
      const now = Date.now()
      for (const [id, session] of this._sessions) {
        if (now - session.lastSeen > STALE_MS) {
          this._sessions.delete(id)
        }
      }
    }, 60 * 1000) // Every 60 seconds
  }

  /**
   * Stop cleanup interval.
   * @private
   */
  _stopCleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval)
      this._cleanupInterval = null
    }
  }

  /**
   * Register a callback for incoming events.
   * @param {function} callback - receives the current state object
   */
  onEvent(callback) {
    this._callbacks.push(callback)
  }

  /**
   * @returns {object} The current state
   */
  getCurrentState() {
    return this._current
  }

  /**
   * @returns {number} The actual listening port
   */
  getPort() {
    return this._port
  }

  /**
   * Get list of active sessions (those with events in last 5 minutes).
   * @returns {Array<{id: string, label: string, lastSeen: number, createdAt: number, agentCount: number}>}
   */
  getSessions() {
    const STALE_MS = 5 * 60 * 1000 // 5 minutes
    const now = Date.now()
    const result = []
    for (const [id, session] of this._sessions) {
      if (now - session.lastSeen > STALE_MS) continue // skip stale
      const agentCount = Object.keys(session.agents).length
      result.push({
        id,
        label: session.label || '',
        lastSeen: session.lastSeen,
        createdAt: session.createdAt,
        agentCount,
      })
    }
    return result
  }

  /** @private */
  _updateSession(sessionId, agentState, terminalLabel) {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, {
        id: sessionId,
        agents: {},
        lastSeen: Date.now(),
        createdAt: Date.now(),
        label: terminalLabel || '',
      })
    }

    const session = this._sessions.get(sessionId)
    session.lastSeen = Date.now()
    if (terminalLabel && !session.label) {
      session.label = terminalLabel
    }

    // Update per-agent state within the session
    if (agentState.agent) {
      session.agents[agentState.agent] = {
        state: agentState.state,
        agent: agentState.agent,
        tool: agentState.tool,
        detail: agentState.detail,
        time: Date.now(),
      }
    }
  }

  /**
   * Get a session's state (aggregated from its agents).
   * @private
   */
  _getSessionState(sessionId) {
    const session = this._sessions.get(sessionId)
    if (!session) return this._current

    // Find the most recently updated agent
    let latest = null
    let latestTime = 0
    for (const agentState of Object.values(session.agents)) {
      if (agentState.time > latestTime) {
        latest = agentState
        latestTime = agentState.time
      }
    }
    return latest || { state: 'idle', agent: null, tool: '', detail: '' }
  }

  /** @private */
  _broadcast(state) {
    const data = JSON.stringify({ current: state, sessionId: state.sessionId || null })

    for (const client of this._clients) {
      // If client has a session filter and this event doesn't match, skip
      if (client.filterSessionId && state.sessionId && client.filterSessionId !== state.sessionId) {
        continue
      }
      try { client.res.write(`data: ${data}\n\n`) } catch { /* ignore */ }
    }
  }

  /** @private */
  _notifyCallbacks(state) {
    for (const cb of this._callbacks) {
      try { cb(state) } catch { /* ignore */ }
    }
  }

  /**
   * Map incoming event types to state objects.
   * Matches the interface of multi-agents/tracker/server.js
   * with added agent field support.
   * @private
   */
  _stateFromEvent(event) {
    switch (event.type) {
      case 'plugin.loaded':
        return { state: 'happy', agent: null, tool: '', detail: 'Plugin loaded' }
      case 'tool.start':
        return {
          state: event.data.tool,
          agent: event.data.agent || null,
          tool: event.data.tool || '',
          detail: event.data.detail || '',
        }
      case 'tool.end':
        return {
          state: 'idle',
          agent: event.data.agent || null,
          tool: event.data.tool || '',
          detail: 'Done: ' + (event.data.tool || ''),
        }
      case 'session':
        if (event.data.type === 'session.error') {
          return { state: 'error', agent: event.data.agent || null, tool: '', detail: 'Error' }
        }
        if (event.data.type === 'session.idle') {
          return { state: 'idle', agent: event.data.agent || null, tool: '', detail: 'Idle' }
        }
        if (event.data.type === 'session.stopped') {
          return { state: 'idle', agent: event.data.agent || null, tool: '', detail: 'Session stopped' }
        }
        return { state: 'thinking', agent: event.data.agent || null, tool: '', detail: event.data.type || '' }
      default:
        return this._current
    }
  }
}

module.exports = { EventServer }
