# Module: `src/panel/html/js/palette.js`

## Purpose
Defines the global color palette for sprite rendering. Maps single-character keys used in sprite frame strings to hex color values (or `'transparent'`). Provides 22 colors: 12 original/core colors plus 10 extended colors for per-agent body differentiation.

## Data flow
```
palette.js (loaded FIRST — no dependencies)
    │
    ▼
Global `pal` object available to:
    ├── sprites.js   — uses palette characters in sprite definitions
    └── renderer.js  — uses pal[char] lookup in drawSprite()
```

## The `pal` object

```javascript
const pal = {
  // ── Core colors (from multi-agents project) ──
  B: '#6C8EBF',   b: '#4A6A9A',   // Blue: body (base), body shadow
  S: '#F5D6B8',   s: '#D4B89A',   // Skin: tone, shadow
  E: '#FFFFFF',                    // Eyes: white
  M: '#8B5E3C',                    // Mouth / brown
  R: '#E86060',    Y: '#F5D94E',   // Red (error), Yellow (sparkles)
  W: '#FFFFFF',    G: '#8888AA',   // White, Gray (shadow)
  O: '#E8A040',    A: '#FF6B8A',   // Orange, Pink
  L: '#4AE0A0',    D: '#A0D0FF',   // Lime/green, Light blue
  o: '#D4B89A',                    // Squinting / mouth interior
  _: 'transparent',                // Transparent (background)

  // ── Extended: agent-specific body colors ──
  T: '#4AB0B0',   t: '#3A9090',   // Teal (explore)
  U: '#7A8AA0',   u: '#5A6A80',   // Gray (general)
  V: '#8A5EA5',   v: '#6A3E85',   // Purple (spec-writer)
  W2:'#4A9A6A',                    // Green (implementer) — note: key collision
  X: '#D08030',   x: '#A06020',   // Orange (tester)
  Y2:'#D0608A',                    // Pink (reviewer)
  Z: '#8B6E4A',   z: '#6B4E2A',   // Brown (docs-writer)
  C: '#40C0D0',   c: '#30A0B0',   // Cyan (validator)
  N: '#D4A030',   n: '#A48020',   // Gold (orchestrator)
  F: '#C0C0C0',                    // Silver / light gray
  H: '#4A9A6A',   h: '#3A7A4A',   // Green (implementer alternative)
  J: '#D0608A',   j: '#A0406A',   // Pink (reviewer alternative)
}
```

## Color groups

| Group | Characters | Count |
|-------|-----------|-------|
| Core body | `B`, `b` | 2 |
| Skin tones | `S`, `s`, `o` | 3 |
| Eye white | `E`, `W` | 2 |
| Accents | `M`, `R`, `Y`, `G`, `O`, `A`, `L`, `D` | 8 |
| Agent bodies | `T`, `U`, `V`, `H`, `J`, `X`, `Z`, `C`, `N` | 9 |
| Agent shadows | `t`, `u`, `v`, `h`, `j`, `x`, `z`, `c`, `n` | 9 |
| Special | `F`, `W2`, `Y2` | 3 |
| Transparent | `_` | 1 |

Total: 22 unique characters (with 2 aliases for green/pink).

## Key exports

- `const pal` — global object (no explicit export; loaded as a global variable before sprites.js and renderer.js)

## Dependencies

None. This is the first script loaded with no dependencies on other modules.

## Usage example

```javascript
// In drawSprite (renderer.js):
const color = pal['B']  // → '#6C8EBF'
const color2 = pal['_'] // → 'transparent'
if (color && color !== 'transparent') {
  ctx.fillStyle = color
  ctx.fillRect(x, y, PX, PX)
}
```

## State management

None. The palette is a static lookup table.

## Edge cases

- **Unknown character**: Returns `undefined` — `renderer.js` checks `if (color && color !== 'transparent')` before drawing, so unrecognized keys are safely skipped
- **Case sensitivity**: Keys are case-sensitive (`'B'` vs `'b'` are different colors)

## Acceptance Criteria covered

- **AC3**: Distinct agent body colors via extended palette entries

## Reference

- [Implementation Plan](../../current/implementation-plan.md) — Component 6
- [Specification](../../../spec.md) — §4.6 `palette.js`, §3.3 Color Palette
