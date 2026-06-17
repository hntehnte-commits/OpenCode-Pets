# Module: `src/panel/html/js/renderer.js`

## Purpose
Canvas 2D rendering engine. Manages per-agent `<canvas>` elements, runs the main `requestAnimationFrame` animation loop, draws sprite frames onto canvases, and updates DOM state labels in sync with the animation.

## Data flow
```
main.js DOMContentLoaded
    │
    ├── createRenderer(agentId, container)   [called per agent]
    │     └── Creates <canvas>, stores { canvas, ctx, currentState, ... }
    │
    └── startAnimation()
          │
          └── requestAnimationFrame(animationLoop)
                │
                ▼
              animationLoop(time)
                │
                For each agent in canvases{}:
                │
                ├── getNextState(agentId) → state.js
                │     If new state: update currentState, reset frame, update DOM labels
                │
                ├── Frame timing: check if (time - lastFrameTime) >= 1000/fps
                │     If yes: advance currentFrame, update lastFrameTime
                │
                └── drawSprite(ctx, agentId, spriteName, frameIndex)
                      │
                      ├── Clear canvas
                      ├── Get sprite frames from sprites.js
                      ├── Get specific frame rows
                      ├── Center 12×11 grid in 120×140 canvas
                      └── For each cell: lookup pal[char], fillRect if not transparent
                │
                └── requestAnimationFrame(animationLoop)  [loop]
```

## Key constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PX` | `10` | Pixels per sprite cell (each character in the 12×11 grid) |
| `CANVAS_W` | `120` | Canvas width in pixels |
| `CANVAS_H` | `140` | Canvas height in pixels |

Note: The canvas is larger than the 12×11 sprite grid (which occupies 120×110 at PX=10) — sprites are centered vertically in the canvas leaving 15px padding top/bottom.

## Global state

### `canvases` (object)
Keyed by `agentId`, each value is:
```javascript
{
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  currentState: string,       // 'idle', 'happy', 'write', etc.
  currentFrame: number,       // Current frame index (0-based)
  lastFrameTime: DOMHighResTimeStamp,  // From performance.now()
  prevSpriteName: string|null, // Tracks sprite transitions for frame reset
}
```

## Key exports / functions

### `createRenderer(agentId, container): HTMLCanvasElement`
- **Parameters**:
  - `agentId: string` — unique agent identifier
  - `container: HTMLElement` — DOM element to append the canvas to
- **Returns**: The created `HTMLCanvasElement`
- **Side effects**: Creates `<canvas>`, appends to container, initializes `canvases[agentId]` with render state
- **Called by**: `main.js` during agent grid creation

### `drawSprite(ctx, agentId, spriteName, frameIndex)`
- **Parameters**:
  - `ctx: CanvasRenderingContext2D` — canvas context to draw on
  - `agentId: string` — agent identifier (for per-agent sprites)
  - `spriteName: string` — state name (e.g. 'idle', 'write')
  - `frameIndex: number` — which frame to draw (modulo frame count)
- **Behavior**:
  - Clears the entire canvas
  - Retrieves sprite via `getSprite(agentId, spriteName)` from sprites.js
  - If no sprite or no frames, returns without drawing
  - Centers the 12×11 grid in the 120×140 canvas
  - Iterates rows and columns: looks up each character in `pal` (palette.js), calls `fillRect` if not transparent
- **Side effects**: Draws on the canvas context

### `animationLoop(time)`
- **Parameters**: `time: DOMHighResTimeStamp` — from rAF
- **Behavior**: Iterates all agents in `canvases{}`:
  1. Checks state queue via `getNextState(agentId)` — if a new state is available, updates `currentState`, resets frame, updates DOM labels (`.state-label` text/class, `#eventDetail` text)
  2. Computes `frameDuration = 1000 / sprite.fps` (default 2fps)
  3. Advances frame if enough time has elapsed
  4. Calls `drawSprite()` to render the current frame
  5. Schedules next frame via `requestAnimationFrame(animationLoop)`
- **Side effects**: Draws to canvases, updates DOM

### `startAnimation()`
- **Behavior**: Initiates the rAF loop by calling `requestAnimationFrame(animationLoop)`
- **Called by**: `main.js` after agent grid is created

## Dependencies
- `sprites.js` — `getSprite(agentId, spriteName)` for frame data
- `palette.js` — `pal` object for character→color lookup
- `state.js` — `getNextState(agentId)` for state queue processing

## Usage example
```javascript
// Called from main.js
const canvas = createRenderer('explore', cellElement)
startAnimation()
// The animation loop runs automatically thereafter
```

## State management
- `canvases{}` — per-agent render state (frame index, timing, current sprite)
- Canvas state is preserved when the panel is hidden (`retainContextWhenHidden: true`)
- State transitions are driven by `state.js` queues

## Edge cases
- **Missing sprite**: `getSprite` falls back to `idle` → no crash
- **Empty frames array**: `drawSprite` returns early
- **Zero fps sprite**: Falls back to 2fps default (`sprite.fps || 2`)
- **Rapid state changes**: Queue system (400ms min display) prevents flicker
- **Hidden tab**: `requestAnimationFrame` automatically pauses; resumes on visibility

## Acceptance Criteria covered
- **AC2**: Multiple canvases created and animated simultaneously
- **AC4**: Animation loop advances frames correctly per-agent (≥2 frames per state)

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 9
- [Specification](../../../spec.md) — §4.9 `renderer.js`
