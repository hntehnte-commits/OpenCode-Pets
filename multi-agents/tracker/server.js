import http from 'http'

const PORT = 3001
let current = { state: 'idle', tool: '', detail: '' }
const clients = new Set()

function stateFromEvent(event) {
  switch (event.type) {
    case 'plugin.loaded':
      return { state: 'happy', tool: '', detail: 'Plugin loaded' }
    case 'tool.start':
      return { state: event.data.tool, tool: event.data.tool, detail: JSON.stringify(event.data.args).slice(0, 60) }
    case 'tool.end':
      return { state: 'idle', tool: '', detail: 'Done: ' + event.data.tool }
    case 'session':
      if (event.data.type === 'session.error') return { state: 'error', tool: '', detail: 'Error' }
      if (event.data.type === 'session.idle') return { state: 'idle', tool: '', detail: 'Idle' }
      return { state: 'thinking', tool: '', detail: event.data.type }
    default:
      return current
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/event') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const event = JSON.parse(body)
        current = stateFromEvent(event)
        for (const c of clients) c.write(`data: ${JSON.stringify({ current })}\n\n`)
        res.writeHead(200)
        res.end('ok')
      } catch { res.writeHead(400); res.end('bad') }
    })
    return
  }

  if (req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })
    res.write(`data: ${JSON.stringify({ current })}\n\n`)
    clients.add(res)
    req.on('close', () => clients.delete(res))
    return
  }

  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(HTML)
})

server.listen(PORT, () => console.log(`Tracker: http://localhost:${PORT}`))

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>opencode tracker</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #1a1a2e;
  font-family: monospace;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  color: #e0e0e0;
  transition: background .6s;
}
body.error { background: #2e1a1a; }
body.thinking { background: #1a2e1a; }
.card {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 24px;
  padding: 48px;
  text-align: center;
  backdrop-filter: blur(8px);
}
canvas { display: block; margin: 0 auto 24px; image-rendering: pixelated; }
.status { font-size: 14px; margin-top: 16px; opacity: .7; }
.state-label {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 99px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 16px;
  background: rgba(255,255,255,.08);
}
.state-label.tool { background: #4a6fa5; }
.state-label.error { background: #a54a4a; }
.state-label.thinking { background: #4a8c5c; }
.state-label.idle { background: #5a5a7a; }
</style>
</head>
<body>
<div class="card">
  <div id="label" class="state-label idle">idle</div>
  <canvas id="c" width="120" height="140"></canvas>
  <div class="status" id="detail"></div>
</div>
<script>
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const label = document.getElementById('label')
const detail = document.getElementById('detail')
const PX = 10

const pal = {
  B: '#6C8EBF', b: '#4A6A9A', S: '#F5D6B8', s: '#D4B89A',
  E: '#FFFFFF', P: '#1a1a2e', M: '#8B5E3C',
  R: '#E86060', Y: '#F5D94E', W: '#FFFFFF', G: '#8888AA',
  O: '#E8A040', A: '#FF6B8A', L: '#4AE0A0', D: '#A0D0FF',
  _: 'transparent',
}

const sprites = {
  idle: { fps: 2, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBS_S_SBB_',
      '_BBS_S_SBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
  ]},
  happy: { fps: 3, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSUUSUBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSUUUSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '___B_B_B___',
      '__B_____B__',
    ],
  ]},
  error: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBXEXEXBB_',
      '_BBXEXEXBB_',
      '_BBSSSSSBB_',
      '_BBSoooSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBX_X_XBB_',
      '_BBX_X_XBB_',
      '_BBSSSSSBB_',
      '_BBSoooSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
  ]},
  thinking: { fps: 2, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMCMBBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSM_MSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '____B_B____',
      '___B___B___',
    ],
  ]},
  write: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '__Y_B_B____',
      '_Y__B___B__',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '_Y__B_B____',
      'Y___B___B__',
    ],
  ]},
  read: { fps: 3, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBoEoEoBB_',
      '_BBoEoEoBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '__W_B_B____',
      '_WW_B___B__',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBoEoEoBB_',
      '_BBoEoEoBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '___BBGBB___',
      '____BGB____',
      '_W__B_B____',
      'WW__B___B__',
    ],
  ]},
  bash: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__BBBGBBB__',
      '_A_BBGBB___',
      '_A__BGB____',
      '____B_B____',
      '___B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB_',
      '_BBSESESBB_',
      '_BBSSSSSBB_',
      '_BBSMSMSBB_',
      '__LABGBAB__',
      '_ALBBGBB___',
      '_A__BGB____',
      '____B_B____',
      '___B___B___',
    ],
  ]},
}

const MIN_VISIBLE_MS = 400
const stateQueue = []

let displayingState = 'idle'
let stateStartTime = performance.now()
let currentFrame = 0
let lastFrameTime = 0
let prevSpriteName = null

function drawSprite(name, frameIndex) {
  ctx.clearRect(0, 0, 120, 140)
  const sprite = sprites[name] || sprites.idle
  const rows = sprite.frames[frameIndex % sprite.frames.length]
  const ox = (120 - rows[0].length * PX) / 2
  const oy = (140 - rows.length * PX) / 2
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x]
      const color = pal[c]
      if (color && color !== 'transparent') {
        ctx.fillStyle = color
        ctx.fillRect(ox + x * PX, oy + y * PX, PX, PX)
      }
    }
  }
}

function applyDisplay(entry) {
  const prev = displayingState
  displayingState = entry.sprite
  stateStartTime = performance.now()
  label.textContent = entry.tool || entry.sprite || 'idle'
  label.className = 'state-label ' + entry.sprite
  detail.textContent = entry.detail || ''
  document.body.className = entry.sprite === 'error' ? 'error' : entry.sprite === 'thinking' ? 'thinking' : ''
}

function processStateQueue() {
  if (stateQueue.length > 0 && performance.now() - stateStartTime >= MIN_VISIBLE_MS) {
    applyDisplay(stateQueue.shift())
  }
}

function animationLoop(time) {
  processStateQueue()

  const name = displayingState || 'idle'
  const sprite = sprites[name] || sprites.idle

  if (name !== prevSpriteName) {
    currentFrame = 0
    lastFrameTime = time
    prevSpriteName = name
  }

  const frameDuration = 1000 / sprite.fps
  if (time - lastFrameTime >= frameDuration) {
    currentFrame = (currentFrame + 1) % sprite.frames.length
    lastFrameTime = time
  }

  drawSprite(name, currentFrame)

  requestAnimationFrame(animationLoop)
}

function mapState(s) {
  const m = {
    read: 'read', write: 'write', edit: 'write',
    bash: 'bash', grep: 'read', glob: 'read',
    error: 'error', idle: 'idle', thinking: 'thinking',
    'plugin.loaded': 'happy', happy: 'happy',
  }
  return m[s] || 'idle'
}

const src = new EventSource('/stream')
src.onmessage = e => {
  const { current } = JSON.parse(e.data)
  const sprite = mapState(current.state)

  const last = stateQueue[stateQueue.length - 1]
  if (!last || last.sprite !== sprite) {
    stateQueue.push({ sprite, tool: current.tool, detail: current.detail })
  }
}

requestAnimationFrame(animationLoop)
</script>
</body>
</html>`
