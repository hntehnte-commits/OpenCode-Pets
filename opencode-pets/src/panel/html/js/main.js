(function () {
  'use strict'

  let vscode = null
  let port = 3001
  let eventSource = null
  let lastEventTime = 0
  let usePostMessageFallback = false
  let retryDelay = 1000 // starts at 1s, backs off to 5s max
  let retryTimer = null
  let selectedSessionId = null // null means "show all"

  document.addEventListener('DOMContentLoaded', function () {
    // Acquire VSCode API
    try {
      vscode = acquireVsCodeApi()
    } catch (e) {
      console.log('[OpenCode Pets] Not running in VS Code host')
    }

    // Read port from meta tag
    const metaPort = document.querySelector('meta[name="port"]')
    if (metaPort) {
      port = parseInt(metaPort.getAttribute('content'), 10)
    }

    // Notify extension host that the panel is ready
    if (vscode) {
      vscode.postMessage({ type: 'ready' })
    }

    // Create agent grid
    const grid = document.getElementById('pet-grid')
    if (!grid) return

    // Phase 2: Render all 10 agents in a responsive flexbox grid
    const agentList = (typeof AGENTS !== 'undefined' && AGENTS.length > 0)
      ? AGENTS
      : [{ id: 'robot', name: 'Robot', color: '#6C8EBF' }]

    agentList.forEach(function (agent) {
      const cell = document.createElement('div')
      cell.className = 'agent-cell'
      cell.setAttribute('data-agent', agent.id)

      // Create canvas via renderer
      createRenderer(agent.id, cell)

      // Agent name label
      const label = document.createElement('div')
      label.className = 'agent-label'
      label.textContent = agent.name
      cell.appendChild(label)

      // State label
      const stateLabel = document.createElement('div')
      stateLabel.className = 'state-label idle'
      stateLabel.textContent = 'idle'
      cell.appendChild(stateLabel)

      grid.appendChild(cell)
    })

    // Update agent count
    const countEl = document.getElementById('agentCount')
    if (countEl) {
      countEl.textContent = agentList.length + ' agents'
    }

    // Start the animation loop
    startAnimation()

    // Connect to SSE event stream
    connectSSE()

    // Listen for postMessage events from the extension host
    window.addEventListener('message', function (event) {
      const msg = event.data
      if (!msg) return

      switch (msg.type) {
        case 'event':
          // Filter by session if one is selected
          if (selectedSessionId && msg.sessionId && msg.sessionId !== selectedSessionId) {
            return // Discard events from other sessions
          }
          // Only process via postMessage if SSE is in fallback mode
          // (SSE is the primary event path)
          if (usePostMessageFallback) {
            handleEventData({ current: msg.data, time: msg.time || 0 })
          }
          break
        case 'sessionSelected':
          // Change which session we're tracking
          selectedSessionId = msg.sessionId || null
          // Clear existing state queues so agents reset to idle
          if (typeof clearAllStateQueues === 'function') {
            clearAllStateQueues()
          }
          // Update session indicator in header
          updateSessionIndicator(selectedSessionId)
          break
        case 'theme':
          document.body.classList.toggle('vscode-light', msg.theme === 'light')
          break
        case 'agents':
          // Phase 2: will dynamically add agent cells
          break
      }
    })

    // Handle visibility changes — pause/resume handled automatically by rAF
    document.addEventListener('visibilitychange', function () {
      // When the tab is hidden, rAF pauses; no extra handling needed
    })
  })

  /**
   * Update the session indicator in the panel header.
   * @param {string|null} sessionId
   */
  function updateSessionIndicator(sessionId) {
    const header = document.querySelector('header')
    if (!header) return

    // Remove existing session indicator if present
    const existing = document.getElementById('sessionIndicator')
    if (existing) existing.remove()

    const indicator = document.createElement('span')
    indicator.id = 'sessionIndicator'
    indicator.className = 'session-indicator'
    indicator.title = 'Click to switch session'

    if (sessionId) {
      indicator.textContent = 'Session: ' + sessionId.slice(0, 8) + '…'
    } else {
      indicator.textContent = 'All Sessions'
    }

    // Click handler to trigger VSCode command
    indicator.style.cursor = 'pointer'
    indicator.addEventListener('click', function () {
      if (vscode) {
        vscode.postMessage({ type: 'selectSession' })
      }
    })

    header.appendChild(indicator)
  }

  /**
   * Connect to the SSE /stream endpoint (primary event path).
   * On failure, enables postMessage fallback and retries with backoff.
   * Backoff: 1s → 2s → 4s → 5s (max)
   */
  function connectSSE() {
    // Ensure any previous EventSource is closed before creating a new one
    if (eventSource) {
      try { eventSource.close() } catch { /* ignore */ }
      eventSource = null
    }

    try {
      eventSource = new EventSource('http://localhost:' + port + '/stream')

      eventSource.onmessage = function (e) {
        try {
          const data = JSON.parse(e.data)
          handleEventData(data)
        } catch (err) {
          console.error('[OpenCode Pets] SSE parse error:', err)
        }
      }

      eventSource.onerror = function () {
        console.error('[OpenCode Pets] SSE connection error, enabling postMessage fallback...')
        if (retryTimer) return  // Already reconnecting
        usePostMessageFallback = true
        if (eventSource) {
          try { eventSource.close() } catch { /* ignore */ }
          eventSource = null
        }
        retryTimer = setTimeout(function () {
          retryTimer = null
          retryDelay = Math.min(retryDelay * 2, 5000)
          connectSSE()
        }, retryDelay)
      }

      eventSource.onopen = function () {
        console.log('[OpenCode Pets] SSE connected on port ' + port)
        usePostMessageFallback = false
        retryDelay = 1000 // reset backoff on successful connection
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
      }
    } catch (e) {
      console.error('[OpenCode Pets] EventSource creation failed:', e)
      usePostMessageFallback = true
      if (retryTimer) return  // Already reconnecting
      retryTimer = setTimeout(function () {
        retryTimer = null
        retryDelay = Math.min(retryDelay * 2, 5000)
        connectSSE()
      }, retryDelay)
    }
  }

  /**
   * Handle event data from either SSE or postMessage relay.
   * Uses a timestamp-based dedup to avoid processing the same event twice.
   * @param {object} data - Event data object
   */
  function handleEventData(data) {
    // Dedup: skip if the event time is the same or earlier than last processed
    const eventTime = data.time || 0
    if (eventTime > 0 && eventTime <= lastEventTime) return
    if (eventTime > 0) lastEventTime = eventTime

    processEvent(data)
  }
})()
