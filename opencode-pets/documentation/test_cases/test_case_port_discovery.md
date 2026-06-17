# Test Case: Port Discovery

**Module:** `src/utils/portFile.js`, `src/server/eventServer.js`, `.opencode/plugins/dashboard.js`  
**Version:** 2.0  
**AC Reference:** AC1, AC2

---

## TC-PD-01: Extension writes port file on successful start

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start VSCode with OpenCode Pets extension activated | File `~/.opencode/dashboard.json` exists |
| 2 | Read the file | Valid JSON: `{ "port": <number>, "pid": <number>, "startedAt": <number>, "version": 1 }` |
| 3 | Verify `port` matches the server's actual port | Extension log shows "listening on port X", file has port X |
| 4 | Stop the extension (deactivate VSCode or disable extension) | File is deleted |

**PASS / FAIL**

---

## TC-PD-02: Extension writes correct port when 3001 is busy

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start another process on port 3001 (e.g., `nc -l 3001` or `python -m http.server 3001`) | Port 3001 is in use |
| 2 | Start VSCode with OpenCode Pets extension | Server starts on 3002 (or next available) |
| 3 | Read `~/.opencode/dashboard.json` | `port` field shows 3002 (not 3001) |
| 4 | `curl -X POST http://localhost:3002/event -H 'Content-Type: application/json' -d '{"type":"test"}'` | Returns `ok` |

**PASS / FAIL**

---

## TC-PD-03: Plugin reads port file and sends events to correct URL

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure extension is running and port file exists | File contains correct port |
| 2 | Load `dashboard.js` plugin in opencode terminal | Plugin reads port from file |
| 3 | Plugin sends `plugin.loaded` event | Event is received by extension on the discovered port |
| 4 | Check extension logs | Show incoming event with correct session_id |

**PASS / FAIL**

---

## TC-PD-04: Plugin falls back to default port when file missing

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Delete `~/.opencode/dashboard.json` | File absent |
| 2 | Load `dashboard.js` plugin in opencode terminal | Plugin falls back to `http://localhost:3001/event` |
| 3 | If server is on 3001 | Events received normally |
| 4 | If server is on different port | Plugin retries and discovers correct port |

**PASS / FAIL**

---

## TC-PD-05: Plugin retries on connection failure

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load plugin BEFORE extension is started | Plugin tries to read file → fails → uses default port |
| 2 | POST to default port fails | Plugin retries with backoff (500ms → 1s → 2s → 4s → 8s) |
| 3 | Start extension on port 3002 during retry window | Plugin re-reads file on retry, discovers port 3002 |
| 4 | Plugin sends event to 3002 | Event received, retry stops |

**PASS / FAIL**
