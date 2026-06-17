# Pending Items — OpenCode Pets v2.0

**Status:** `INVESTIGATING`  
**Created:** 2026-06-17  
**Updated:** 2026-06-17  
**Owner:** SSD Orchestrator  

---

## Problem: Sub-agents don't show activity on dashboard

### Symptoms
- Orchestrator (ssd-orchestrator) shows "thinking" correctly via `session.thinking` events
- Sub-agents (ssd-planner, ssd-spec-writer, ssd-tester, etc.) never show any activity
- Their sprites remain idle while they're actively using tools

---

## Attempted Fixes

### Attempt 1: Add `session.thinking` to event handler (FAILED)

**What:** Added `'session.thinking'` to the list of session events forwarded by the plugin's `event` handler.

**Files:**
- `.opencode/plugins/dashboard.js` — event handler

**Why it failed:** The `session.thinking` events carry agent info only for the orchestrator, not for sub-agents. Sub-agents don't emit their own `session.thinking` events.

---

### Attempt 2: Context tracking via task args (FAILED — buggy)

**What:** Added `_currentAgent` tracking in the plugin. When the orchestrator calls `task`, try to detect which sub-agent is being invoked from the task arguments (`output.args`). Attribute subsequent tool events to that agent.

**Files:**
- `.opencode/plugins/dashboard.js` — added `_currentAgent`, `extractAgentFromTaskArgs()`, `resolveAgent()`

**Root cause of failure:** The `extractAgentFromTaskArgs` function had a bug:
1. When `args.agent = "ssd-planner"`, the function set `text = "ssd-planner"` 
2. Then tried to regex match `/@([a-zA-Z][a-zA-Z0-9_\/-]+)/` which requires `@` prefix
3. Since there was no `@`, the regex returned `null`
4. `_currentAgent` was never set

**Bug fixed in latest version** (281 lines, copied to `~/.opencode/plugins/dashboard.js`):
- Now checks `args.agent` directly first (no regex)
- Handles array args
- Falls back to regex for string args and prompt fields

**Why it might still fail:** Even with the bug fixed, the real payload format of `task` tool's `output.args` may not contain the agent reference in any of the formats we check. The `task` tool might get agent routing info from a different source.

---

### Attempt 3: Debug logging added (TESTING)

**What:** Added `console.log` statements to see the actual `output.args` content when `task` is called.

**Files:**
- `.opencode/plugins/dashboard.js` — line 239: `console.log('[Pets Plugin] task called, args:', ...)`
- Also logs `session.thinking` events with agent info

**How to view logs:** Open VSCode dev console (Help → Toggle Developer Tools → Console) or check the terminal where opencode runs.

---

## What We Know for Sure

| Fact | Evidence |
|------|----------|
| `output.agent` is undefined for tool events | SDK type definitions show no `agent` field on `output` |
| `event.agent` may be undefined for session events | SDK type definitions show no `agent` field on session event properties |
| Orchestrator shows "thinking" | `session.thinking` event reaches plugin, agent falls back to `'ssd-orchestrator'` |
| Sub-agents' tools DO fire | We see the orchestrator receiving results, so tools must execute |
| TOOL_AGENT_MAP is insufficient | Most sub-agents have no tools mapped to them |

---

## Potential Root Causes Still to Investigate

1. **`task` args format is unknown** — We don't know what `output.args` actually contains when the orchestrator calls a sub-agent. The `console.log` we added will reveal this.

2. **`task` tool is not used for sub-agent delegation** — The orchestrator might use a different mechanism (e.g., direct agent routing, conversation-based delegation) that doesn't go through the `task` tool.

3. **Agent IDs don't match** — If opencode uses internal agent IDs that differ from the display names in `AGENTS` array (e.g., `ssd/ssd-planner` vs `ssd-planner`), events route to the wrong queue.

4. **State queue dedup is too aggressive** — `state.js` `processEvent()` skips events if `last.sprite === sprite`. If consecutive events map to the same sprite, only the first is queued.

5. **Webview isn't receiving the events** — SSE connection or postMessage fallback might be filtering them out based on session_id.

---

## Next Steps

1. **Check the debug logs** — Run opencode, invoke sub-agents, then check VSCode dev console for `[Pets Plugin]` log messages. This will reveal the actual `output.args` format for `task` calls.

2. **If logs show the agent reference:**
   - Fix `extractAgentFromTaskArgs` to handle the actual format
   - Verify `_currentAgent` is set correctly
   - Verify `resolveAgent()` returns the correct agent for sub-agent tools

3. **If logs show NO agent reference:**
   - The agent info comes from outside the task args
   - Need a different approach: perhaps parse `input.sessionID` or track via conversation context

4. **If events reach server but not Webview:**
   - Check `eventServer.js` session filtering (`_broadcast` checks `filterSessionId`)
   - Check `main.js` SSE message handler
   - Check `state.js` `processEvent()` dedup logic

5. **If all else fails:**
   - Consider adding agent info directly in the `task` tool's format
   - Consider a server-side approach where we track tool → agent mappings based on event sequencing

---

## Root Cause Analysis (2026-06-17)

### Likely fundamental issue: sub-agents run in separate runtime contexts

The plugin at `~/.opencode/plugins/dashboard.js` is loaded into the **main opencode session** (the orchestrator's context). When the orchestrator delegates work to a sub-agent via `task`, the sub-agent runs in its **own runtime context**, which **may not have the plugin loaded** (or loads a separate instance with a different `SESSION_ID` UUID).

This means:
- The orchestrator's plugin **cannot intercept** sub-agent tool events (`read`, `write`, `bash`, etc.)
- `tool.execute.before/after` for sub-agent tools never fire in the orchestrator's plugin
- Only `task` tool start/end events are visible

### Why context-tracking almost works but not fully

The `_currentAgent` approach sets the agent when `task` starts and clears it when `task` ends:
1. `task` starts → `_currentAgent = "ssd-planner"` ✓
2. Sub-agent runs tools → plugin sees NOTHING (different context) ✗
3. `task` ends → `_currentAgent = null` ✓

So the sub-agent briefly shows "thinking" (from the `task` tool.start event mapping to `mapState("task") → 'thinking'`), but never shows individual tool states.

### The fix applied (2026-06-17)

Two improvements:
1. **Fixed `extractAgentFromTaskArgs`**: Now checks `args.agent` directly first (no regex needed), handles array args, falls back to regex for strings
2. **Explicit session events for sub-agents**: When `task` starts, immediately send `session.thinking` for the detected sub-agent. When `task` ends, send `session.idle`. This ensures the sub-agent shows the "thinking" animation for the duration of its work.

### What you should see after fix

When orchestrator delegates to `ssd-planner`:
1. Orchestrator shows "thinking" (via `session.thinking` event) ✓
2. `task` detected → `session.thinking` sent for `ssd-planner`
3. ssd-planner sprite appears and shows "thinking" animation ✓
4. ssd-planner continues showing "thinking" until `task` completes
5. `task` ends → `session.idle` sent for `ssd-planner` → goes idle ✓

**Limitation**: You won't see which TOOL the sub-agent is using (read/write/bash), only that it's "thinking". To see tool-level events, the plugin would need to be loaded in sub-agent contexts.

---

## Files to Watch

| File | What to check |
|------|---------------|
| `~/.opencode/plugins/dashboard.js` | Debug logs, context tracking |
| `src/server/eventServer.js` | Session filtering, state broadcast |
| `src/panel/html/js/main.js` | SSE handling, session filtering |
| `src/panel/html/js/state.js` | `processEvent()`, `mapState()`, dedup |
| `src/panel/html/js/sprites.js` | `AGENTS` array, agent IDs |
