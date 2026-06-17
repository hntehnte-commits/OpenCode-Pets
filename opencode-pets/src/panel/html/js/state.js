// Per-agent state queues with minimum display time
const stateQueues = {}
const agentStates = {}
const MIN_VISIBLE_MS = 400
const MAX_QUEUE = 20

/**
 * Map opencode tool/event names to sprite state names.
 * Uses same mapping as multi-agents/tracker/server.js.
 */
function mapState(s) {
  const m = {
    read: 'read', write: 'write', edit: 'write',
    bash: 'bash', grep: 'read', glob: 'read',
    error: 'error', idle: 'idle', thinking: 'thinking',
    'plugin.loaded': 'happy', happy: 'happy',
    // Orchestrator tools (show as thinking since they involve planning/coordination)
    task: 'thinking',
    todowrite: 'write',
    skill: 'read',
  }
  return m[s] || 'idle'
}

/**
 * Process an incoming event and push to the appropriate agent's queue.
 * If no specific agent, broadcasts to all known agents.
 * @param {object} eventData - { current: { state, agent, tool, detail } }
 */
function processEvent(eventData) {
  const { current } = eventData
  if (!current || !current.state) return

  const sprite = mapState(current.state)
  const agentId = current.agent || null

  if (agentId) {
    // Route to specific agent
    if (!stateQueues[agentId]) stateQueues[agentId] = []
    const q = stateQueues[agentId]
    const last = q[q.length - 1]
    if (!last || last.sprite !== sprite) {
      if (q.length >= MAX_QUEUE) q.shift()  // Drop oldest if at capacity
      q.push({ sprite, tool: current.tool || '', detail: current.detail || '' })
    }
  } else {
    // Broadcast to all agents
    const allIds = typeof AGENTS !== 'undefined'
      ? AGENTS.map((a) => a.id)
      : ['default']
    const ids = new Set([...allIds, ...Object.keys(stateQueues)])
    for (const id of ids) {
      if (!stateQueues[id]) stateQueues[id] = []
      const q = stateQueues[id]
      const last = q[q.length - 1]
      if (!last || last.sprite !== sprite) {
        if (q.length >= MAX_QUEUE) q.shift()  // Drop oldest if at capacity
        q.push({ sprite, tool: current.tool || '', detail: current.detail || '' })
      }
    }
  }
}

/**
 * Pop the next state from an agent's queue if MIN_VISIBLE_MS has elapsed.
 * @param {string} agentId
 * @returns {object|null} { sprite, tool, detail } or null
 */
function getNextState(agentId) {
  if (!stateQueues[agentId] || stateQueues[agentId].length === 0) return null

  const now = performance.now()
  const current = agentStates[agentId]

  // If no current state or minimum time elapsed, dequeue next
  if (!current || (now - current.time >= MIN_VISIBLE_MS)) {
    const next = stateQueues[agentId].shift()
    if (next) {
      agentStates[agentId] = { ...next, time: now }
      return next
    }
  }
  return null
}

/**
 * Clear all state queues (used when switching sessions).
 * Each agent resets to idle.
 */
function clearAllStateQueues() {
  for (const id of Object.keys(stateQueues)) {
    stateQueues[id] = []
  }
  for (const id of Object.keys(agentStates)) {
    agentStates[id] = null
  }
}

/**
 * @param {string} agentId
 * @returns {string} Current sprite name for the agent
 */
function getCurrentState(agentId) {
  const s = agentStates[agentId]
  return s ? s.sprite : 'idle'
}
