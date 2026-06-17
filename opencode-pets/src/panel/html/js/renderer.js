// Canvas rendering engine
// PX = pixels per sprite cell. Sprite grid is 12x11, canvas is 120x140 (centered with padding)
const PX = 10
const CANVAS_W = 120
const CANVAS_H = 140

const canvases = {}

/**
 * Create a canvas for an agent and append to the container.
 * @param {string} agentId
 * @param {HTMLElement} container - DOM element to append canvas to
 * @returns {HTMLCanvasElement}
 */
function createRenderer(agentId, container) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  canvas.setAttribute('data-agent', agentId)

  const ctx = canvas.getContext('2d')
  container.appendChild(canvas)

  canvases[agentId] = {
    canvas,
    ctx,
    currentState: 'idle',
    currentFrame: 0,
    lastFrameTime: performance.now(),
    prevSpriteName: null,
  }

  return canvas
}

/**
 * Draw a single sprite frame on a canvas context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} agentId - agent identifier for per-agent sprites
 * @param {string} spriteName
 * @param {number} frameIndex
 */
function drawSprite(ctx, agentId, spriteName, frameIndex) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

  const sprite = getSprite(agentId, spriteName)
  if (!sprite || !sprite.frames || sprite.frames.length === 0) return

  const rows = sprite.frames[frameIndex % sprite.frames.length]
  if (!rows) return

  // Center the 12x11 sprite in the 120x140 canvas
  const ox = (CANVAS_W - rows[0].length * PX) / 2
  const oy = (CANVAS_H - rows.length * PX) / 2

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const c = row[x]
      const color = pal[c]
      if (color && color !== 'transparent') {
        ctx.fillStyle = color
        ctx.fillRect(ox + x * PX, oy + y * PX, PX, PX)
      }
    }
  }
}

/**
 * Main animation loop — called via requestAnimationFrame.
 * Updates frames for all agents independently.
 */
function animationLoop(time) {
  for (const [agentId, state] of Object.entries(canvases)) {
    // Process state queue — check if it's time to show the next state
    const nextState = getNextState(agentId)
    if (nextState) {
      state.currentState = nextState.sprite
      state.prevSpriteName = null  // Force frame reset

      // Update DOM labels
      const cell = state.canvas.closest('.agent-cell')
      if (cell) {
        const stateLabel = cell.querySelector('.state-label')
        if (stateLabel) {
          stateLabel.textContent = nextState.sprite
          stateLabel.className = 'state-label ' + nextState.sprite
        }
        const detail = document.getElementById('eventDetail')
        if (detail && nextState.detail) {
          detail.textContent = nextState.detail
        }
      }
    }

    // Advance animation frame
    const name = state.currentState || 'idle'
    const sprite = getSprite(agentId, name)

    if (name !== state.prevSpriteName) {
      state.currentFrame = 0
      state.lastFrameTime = time
      state.prevSpriteName = name
    }

    const frameDuration = 1000 / (sprite.fps || 2)
    if (time - state.lastFrameTime >= frameDuration) {
      state.currentFrame = (state.currentFrame + 1) % (sprite.frames ? sprite.frames.length : 1)
      state.lastFrameTime = time
    }

    // Draw the current frame
    drawSprite(state.ctx, agentId, name, state.currentFrame)
  }

  requestAnimationFrame(animationLoop)
}

/**
 * Start the animation loop.
 */
function startAnimation() {
  requestAnimationFrame(animationLoop)
}
