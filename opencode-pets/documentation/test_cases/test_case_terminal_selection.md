# Test Case: Terminal Selection

**Module:** `src/panel/sessionManager.ts`, `src/panel/petsPanel.ts`, `src/panel/html/js/main.js`  
**Version:** 2.0  
**AC Reference:** AC5, AC6

---

## TC-TS-01: QuickPick shown when ≥2 sessions active

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start 2 opencode terminals (different session_ids) | Server has 2 active sessions |
| 2 | Open dashboard panel (`opencode-pets.showPanel`) | QuickPick dialog appears |
| 3 | QuickPick shows both sessions | Each shows label (or truncated ID), agent count, last active time |
| 4 | QuickPick includes "Show All Sessions" option | Visible when >1 session |

**PASS / FAIL**

---

## TC-TS-02: Single session auto-selects, no QuickPick

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start 1 opencode terminal | Server has 1 active session |
| 2 | Open dashboard panel | Panel opens directly, no QuickPick |
| 3 | Panel shows events from the single session | Agents animate correctly |

**PASS / FAIL**

---

## TC-TS-03: Session selection filters events

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Have 2 active sessions (A and B) | Both sending events |
| 2 | Open panel, select session A | Only session A's agents animate |
| 3 | Session B sends events | No visible change (filtered out) |
| 4 | Use `opencode-pets.selectSession` to switch to B | Session B's agents animate, A's agents idle |

**PASS / FAIL**

---

## TC-TS-04: Session selection persists across restart

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open panel, select session "abc123" | Session selected, indicator shows truncated ID |
| 2 | Close panel | Panel disposed |
| 3 | Reopen panel (`opencode-pets.showPanel`) | Same session "abc123" is restored |
| 4 | If "abc123" is still active | Panel opens directly without QuickPick |
| 5 | If "abc123" is no longer active | QuickPick shown to re-select |

**PASS / FAIL**

---

## TC-TS-05: Session indicator shows current session

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open panel with session selected | Header shows "Session: abc12345…" |
| 2 | Click session indicator | Triggers `selectSession` QuickPick |
| 3 | Select "Show All Sessions" | Indicator shows "All Sessions" |
| 4 | All events from all sessions shown | Agents animate from all sessions |

**PASS / FAIL**

---

## TC-TS-06: SSE filters by session when query param used

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect to `GET /stream?session=abc123` | Only events for session "abc123" received |
| 2 | Connect to `GET /stream` (no param) | All events received |
| 3 | Connect to `GET /stream?session=nonexistent` | Initial state sent, no further events until session appears |

**PASS / FAIL**
