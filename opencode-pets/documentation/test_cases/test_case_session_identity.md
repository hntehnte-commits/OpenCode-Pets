# Test Case: Session Identity

**Module:** `src/server/eventServer.js`, `.opencode/plugins/dashboard.js`  
**Version:** 2.0  
**AC Reference:** AC3, AC4

---

## TC-SI-01: Plugin generates UUID v4 session_id on load

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load plugin in terminal 1 | A UUID v4 session_id is generated (format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`) |
| 2 | Load plugin in terminal 2 | A different UUID v4 session_id is generated |
| 3 | Check all events from terminal 1 | All include `session_id: "<id1>"` in POST body |
| 4 | Check all events from terminal 2 | All include `session_id: "<id2>"` in POST body |

**PASS / FAIL**

---

## TC-SI-02: Server tracks per-session state independently

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Terminal 1 sends `tool.start` (agent=explore, tool=read) | Server stores this under session_id_1 |
| 2 | Terminal 2 sends `tool.start` (agent=general, tool=bash) | Server stores this under session_id_2 |
| 3 | `GET /sessions` | Returns 2 sessions with correct agent counts |
| 4 | Session 1's agent state shows `read` | Unaffected by session 2's `bash` state |

**PASS / FAIL**

---

## TC-SI-03: Session cleanup removes stale sessions

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Terminal 1 sends events | Session appears in `/sessions` |
| 2 | Stop terminal 1 (no events for 5+ minutes) | Session removed from `/sessions` |
| 3 | Terminal 1 sends events again | Session re-appears in `/sessions` (re-created) |

**PASS / FAIL**

---

## TC-SI-04: Events without session_id go to "default" session

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send POST to `/event` without `session_id` field | Server routes to `"default"` session |
| 2 | `GET /sessions` | Includes session `{ id: "default", ... }` |
| 3 | Old `track.js` plugin (no session_id) | All events appear under "default" session |

**PASS / FAIL**
