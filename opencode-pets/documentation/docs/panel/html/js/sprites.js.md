# Module: `src/panel/html/js/sprites.js`

## Purpose
Defines pixel-art sprites for all 10 opencode agent types × 7 states = 70 sprite sets. Provides sprite derivation functions (body color replacement, accessory overlays) and the `getSprite()` lookup function with fallback chains.

## Data flow
```
sprites.js (loaded second, after palette.js)
    │
    ├── Base robot sprites (7 states × 2 frames each)
    │
    ├── AGENT_BODY_KEYS — per-agent body/shadow color keys
    ├── AGENT_ACCESSORIES — per-agent pixel overlays
    │
    ├── deriveAgentSprites(bodyKey, shadowKey, overlays)
    │     └── For each state: replace B/b, apply overlay chars
    │
    ├── agentSprites{} — built automatically at load time
    ├── AGENTS[] — agent metadata array
    │
    └── getSprite(agentId, stateName) → sprite object
          Used by renderer.js for drawing
```

## Base sprites (the `sprites` object)

7 states, each with `fps` and 2 animation frames (11 rows × 12 columns):

| State | FPS | Frame count | Visual description |
|-------|-----|-------------|-------------------|
| `idle` | 2 | 2 | Gentle breathing — eye blink between frames |
| `happy` | 3 | 2 | Big smile, raised arms — mouth opens wider |
| `error` | 4 | 2 | Red X eyes, worried mouth — flash between frames |
| `thinking` | 2 | 2 | Hand to chin — pupil darts side to side |
| `write` | 4 | 2 | Pen/writing motion — arm moves with tool |
| `read` | 3 | 2 | Eyes scanning — page turns left to right |
| `bash` | 4 | 2 | Action lines — character sways with motion arcs |

### Sprite character legend (palette keys)

| Char | Meaning | Color |
|------|---------|-------|
| `B` | Body (base blue, replaced per-agent) | `#6C8EBF` |
| `b` | Body shadow (replaced per-agent) | `#4A6A9A` |
| `S` | Skin tone | `#F5D6B8` |
| `s` | Skin shadow | `#D4B89A` |
| `E` | Eye white | `#FFFFFF` |
| `M` | Mouth/brown | `#8B5E3C` |
| `R` | Red / error accents | `#E86060` |
| `Y` | Yellow / sparkles | `#F5D94E` |
| `G` | Gray / shadow | `#8888AA` |
| `o` | Mouth interior (squinting) | `#D4B89A` |

See palette.js for full color mapping.

### Row structure (11 rows, 12 cols)

```
Row  0: ____BBBB____       # Top of head (crown/hair area)
Row  1: __BBBBBBBB__       # Full head width
Row  2: _BBSESESBB__       # Eyes (E) on skin (S)
Row  3: _BBSESESBB__       # Lower eyes / cheeks
Row  4: _BBSSSSSBB__       # Nose bridge / mid face
Row  5: _BBSMSMSBB__       # Mouth (M) area
Row  6: __BBBGBBB___       # Neck
Row  7: ___BBGBB____       # Upper body
Row  8: ____BGB_____       # Mid body
Row  9: ____B_B_____       # Legs
Row 10: ___B___B____       # Feet
```

## Per-agent body colors (`AGENT_BODY_KEYS`)

| Agent ID | Body key | Shadow key | Hex color |
|----------|----------|-----------|-----------|
| `explore` | `T` | `t` | `#4AB0B0` (Teal) |
| `general` | `U` | `u` | `#7A8AA0` (Gray) |
| `ssd-planner` | `B` | `b` | `#6C8EBF` (Blue) |
| `ssd-spec-writer` | `V` | `v` | `#8A5EA5` (Purple) |
| `ssd-implementer` | `H` | `h` | `#4A9A6A` (Green) |
| `ssd-tester` | `X` | `x` | `#D08030` (Orange) |
| `ssd-reviewer` | `J` | `j` | `#D0608A` (Pink) |
| `ssd-docs-writer` | `Z` | `z` | `#8B6E4A` (Brown) |
| `ssd-validator` | `C` | `c` | `#40C0D0` (Cyan) |
| `ssd-orchestrator` | `N` | `n` | `#D4A030` (Gold) |

## Per-agent accessories (`AGENT_ACCESSORIES`)

| Agent | Accessory | Overlay description |
|-------|-----------|-------------------|
| `explore` | Magnifying glass | Circle+line in rows 2–5, left side |
| `general` | Gear | Silver teeth in rows 3–5, right side |
| `ssd-planner` | Clipboard | Rectangular grid at waist rows 5–7 |
| `ssd-spec-writer` | Quill pen | Diagonal line down from right shoulder (rows 2–6) |
| `ssd-implementer` | Wrench | Tool+handle in rows 2–5, right side |
| `ssd-tester` | Shield | Shield shape in rows 3–7, left side |
| `ssd-reviewer` | Glasses | Double circles over eyes (rows 2–3) |
| `ssd-docs-writer` | Book | Open book at waist (rows 5–8) |
| `ssd-validator` | Checkmark | Checkmark above head (rows 0–1) |
| `ssd-orchestrator` | Crown | Crown with jewels on head (rows 0–1) |

## Key exports / functions

### `deriveAgentSprites(bodyKey, shadowKey, overlays): object`
- **Parameters**:
  - `bodyKey: string` — single-char body color key
  - `shadowKey: string` — single-char body shadow key
  - `overlays: object` — `{ default?: { rowIndex: overlayString }, stateName?: { ... } }`
- **Returns**: Complete 7-state sprite set shaped like base `sprites`
- **Behavior**: For each of the 7 base states:
  1. Replace all `B` → `bodyKey` and `b` → `shadowKey` in frame strings
  2. Apply overlay characters (non-`_` chars overwrite at specific row/col)
  3. Return new frames with same `fps`

### `getSprite(agentId, stateName): object`
- **Parameters**:
  - `agentId: string|null` — agent identifier
  - `stateName: string` — state name
- **Returns**: Sprite object `{ fps, frames }`
- **Behavior**:
  - If `agentId` exists in `agentSprites`: returns `agentSprites[agentId][stateName]`, falling back to `agentSprites[agentId].idle`, then to `sprites.idle`
  - Otherwise returns `sprites[stateName]` falling back to `sprites.idle`
- **Called by**: `renderer.js` `drawSprite()`

### `AGENTS[]` (array)
- 10 agent definition objects:
```javascript
{ id: 'explore', name: 'Explore', color: '#4AB0B0' }
// ... 9 more
```
- **Used by**: `main.js` to create agent grid cells

### `agentSprites{}` (object)
- Pre-built at load time by iterating `AGENT_BODY_KEYS` and `AGENT_ACCESSORIES`
- Keyed by `agentId`, each value is a 7-state sprite set

## Dependencies
- `palette.js` — `pal{}` object (sprite characters → hex colors)

## Usage example
```javascript
// Get sprite for agent 'explore' in 'write' state
const sprite = getSprite('explore', 'write')
// sprite = { fps: 4, frames: [ [...], [...] ] }

// Derive custom sprites
const customSprites = deriveAgentSprites('Z', 'z', {
  default: { 5: '___WWWW_____' }
})
```

## State management
None. All data is static and computed at script load time.

## Edge cases
- **Unknown agentId**: `getSprite` falls back to base `sprites.idle`
- **Unknown stateName**: Falls back to `sprites.idle`
- **Empty overlays**: Rows without overlays keep original pixels (thanks to `_` skip logic)

## Acceptance Criteria covered
- **AC2**: All 10 agents displayed simultaneously
- **AC3**: Each agent has a distinct pixel-art design (different body color, face, accessory)
- **AC4**: Each state animates with ≥2 frames

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 7, Phase 3
- [Specification](../../../spec.md) — §4.7 `sprites.js`
