# Module: `src/panel/html/js/state.js`

## Purpose
Event-to-state mapping and per-agent state queue management. Converts incoming opencode tool/event names into sprite state names, maintains a FIFO queue per agent with minimum display time (400ms), and broadcasts events to all agents when no specific agent is targeted.

## Data flow
```
main.js handleEventData(data)  (from SSE or postMessage)
    │
    ▼
processEvent(eventData)
    │
    ├── Extract current: { state, agent, tool, detail }
    ├── mapState(current.state) → sprite name (e.g. 'read', 'write', 'idle')
    │
    ├── If current.agent is set:
    │     └── Push to specific agent's queue (debounced: skip if same as last)
    │
    └── If current.agent is null/undefined:
          └── Broadcast to ALL agents' queues (debounced per agent)
    │
    ▼
renderer.js animationLoop
    │
    └── getNextState(agentId)
          ├── Check if MIN_VISIBLE_MS (400ms) has elapsed since last state
          ├── If yes: shift next entry from queue
          └── Return { sprite, tool, detail } or null
```

## Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `MIN_VISIBLE_MS` | `400` | Minimum time (ms) a state is displayed before next state can show |
| `MAX_QUEUE` | `20` | Maximum queue depth per agent (drops oldest if exceeded) |

## Global state

### `stateQueues` (object)
```javascript
{
  [agentId]: [
    { sprite: 'write', tool: 'edit', detail: 'Writing spec...' },
    // ... up to MAX_QUEUE entries
  ]
}
```
- Keyed by agent ID string
- Each queue entry has `{ sprite, tool, detail }`

### `agentStates` (object)
```javascript
{
  [agentId]: {
    sprite: 'write',
    tool: 'edit',
    detail: 'Writing spec...',
    time: 1718000000000,  // performance.now() timestamp
  }
}
```
- Tracks the **currently displayed** state per agent
- `time` is set when the state is dequeued

## Key exports / functions

### `mapState(s): string`
- **Parameters**: `s: string` — opencode tool/event name
- **Returns**: Sprite state name
- **Mapping table**:

| Input | Output |
|-------|--------|
| `'read'` | `'read'` |
| `'write'` | `'write'` |
| `'edit'` | `'write'` |
| `'bash'` | `'bash'` |
| `'grep'` | `'read'` |
| `'glob'` | `'read'` |
| `'error'` | `'error'` |
| `'idle'` | `'idle'` |
| `'thinking'` | `'thinking'` |
| `'plugin.loaded'` | `'happy'` |
| `'happy'` | `'happy'` |
| (anything else) | `'idle'` |

### `processEvent(eventData)`
- **Parameters**: `eventData: object` — `{ current: { state, agent, tool, detail } }`
- **Behavior**:
  - Guards: returns immediately if `current` or `current.state` is missing
  - Maps state via `mapState()`
  - If `agent` is set: pushes to that agent's queue (debounced: skip if same sprite as last entry; caps at `MAX_QUEUE`)
  - If `agent` is not set: broadcasts to all known agents (from `AGENTS[]` array + any agents that have existing queues)
  - **Debouncing**: Consecutive duplicate sprite values are merged (only one entry)
- **Side effects**: Mutates `stateQueues`

### `getNextState(agentId): object|null`
- **Parameters**: `agentId: string`
- **Returns**: `{ sprite, tool, detail }` or `null` if queue empty or minimum time not elapsed
- **Behavior**:
  - If agent has no queue or empty queue: returns `null`
  - If no current displayed state: immediately dequeues next
  - If `MIN_VISIBLE_MS` has elapsed since last dequeue time: dequeues next
  - Otherwise: returns `null` (current state continues showing)
  - On dequeue: updates `agentStates[agentId]` with new state + current timestamp
- **Called by**: `renderer.js` `animationLoop()`

### `getCurrentState(agentId): string`
- **Parameters**: `agentId: string`
- **Returns**: Current sprite name for the agent, or `'idle'` if none

## Dependencies
- `sprites.js` — `AGENTS[]` array (for broadcasting to all known agents)

## Usage example
```javascript
// An event arrives from the plugin
processEvent({
  current: {
    state: 'write',
    agent: 'ssd-spec-writer',
    tool: 'edit',
    detail: 'Editing documentation'
  }
})

// Later, renderer loop polls:
const next = getNextState('ssd-spec-writer')
// next → { sprite: 'write', tool: 'edit', detail: 'Editing documentation' }
```

## State management
- `stateQueues{}` — per-agent FIFO queues (mutable, grows/shrinks with events)
- `agentStates{}` — current displayed state per agent (set on dequeue)

## Edge cases
- **No agent specified**: Event broadcasts to all agents simultaneously
- **Rapid duplicate events**: Debounce prevents queue flooding (same sprite not added consecutively)
- **Queue overflow**: Oldest entries dropped when queue exceeds `MAX_QUEUE` (20)
- **Unknown agent**: Queue is created on first event for that agent
- **Empty/null event data**: `processEvent` returns early with no side effects

## Acceptance Criteria covered
- **AC5**: Events from opencode trigger correct state transitions on agents
- **AC4**: State changes respect minimum 400ms display time (prevents flicker)

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 8
- [Specification](../../../spec.md) — §4.8 `state.js`
