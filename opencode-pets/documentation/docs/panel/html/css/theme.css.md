# Module: `src/panel/html/css/theme.css`

## Purpose
Defines the visual theme for the OpenCode Pets Webview panel. Uses VSCode CSS variables for automatic light/dark theme adaptation. Controls layout for the header, agent grid, state label colors, and responsive breakpoints.

## Data flow
```
petsPanel.ts reads theme.css from disk
    │
    ▼
Inlined into pets.html <style>{{THEME_CSS}}</style>
    │
    ▼
Browser renders — VSCode CSS variables (var(--vscode-*)) resolve automatically
to the current VSCode theme colors
```

## Key CSS custom properties (in `:root`)

| Variable | Fallback | Purpose |
|----------|----------|---------|
| `--bg-primary` | `#1e1e1e` | Main panel background (maps to VSCode sidebar) |
| `--bg-secondary` | `#252526` | Header/footer background (maps to editor background) |
| `--text-primary` | `#cccccc` | Main text color |
| `--text-secondary` | `#888888` | Secondary/muted text |
| `--border-color` | `#333333` | Panel borders |
| `--card-bg` | `#3a3d41` | Agent cell background (inactive selection) |
| `--pixel-scale` | `8` | Controls canvas rendering size (px per sprite cell) |

## Key selectors and rules

### Layout (`#app`)
- Flexbox column layout, `min-height: 100vh`

### Header
- Flexbox with space-between alignment, bottom border, secondary background

### Agent grid (`#pet-grid`)
- Flexbox `flex-wrap: wrap`, `justify-content: center`
- Each `.agent-cell` is a card with rounded corners, shadow, border

### Canvases
- `image-rendering: pixelated` and `crisp-edges` for crisp pixel art
- Border-radius for rounded corners

### State labels (`.state-label`)
- Pill-shaped badges (`border-radius: 99px`), uppercase, small text
- Color-coded per state:

| State class | Background | Meaning |
|-------------|-----------|---------|
| `.idle` | `#888888` | Gray — no activity |
| `.happy` | `#4AE0A0` | Green — success/loaded |
| `.error` | `#E86060` | Red — error occurred |
| `.thinking` | `#D4A030` | Gold — processing |
| `.write` | `#4A6FA5` | Blue — editing/writing |
| `.read` | `#40C0D0` | Cyan — reading/searching |
| `.bash` | `#E8A040` | Orange — shell command |

### Responsive breakpoints
- **≤480px**: Smaller grid gap (8px), smaller agent cells (100px min-width), smaller canvas (72x84px), smaller font
- **481px–720px**: Medium agent cells (110px min-width)

## Dependencies
- VSCode theme CSS variables — provided by the VSCode runtime (not the CSS file itself)

## Usage example
```css
/* The CSS is read by petsPanel.ts and inlined into pets.html */
/* No manual import needed — VSCode Webview handles the rest */
```

## State management
None. Pure presentation styles. Theme adaptation is handled by VSCode's automatic injection of `body.vscode-dark` / `body.vscode-light` classes.

## Edge cases
- **VSCode CSS variable unavailable**: Falls back to hardcoded hex values (e.g., `#1e1e1e`)
- **Narrow panel**: Responsive rules adjust grid layout; below ~320px the flexbox may still overflow gracefully
- **Custom themes**: Works with any VSCode theme that sets `--vscode-sideBar-background`, `--vscode-editor-background`, etc.

## Acceptance Criteria covered
- **AC6**: Panel adapts to VSCode theme colors (light/dark) automatically

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 5
- [Specification](../../../spec.md) — §4.5 `theme.css`
