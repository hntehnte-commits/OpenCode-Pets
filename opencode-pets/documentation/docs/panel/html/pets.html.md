# Module: `src/panel/html/pets.html`

## Purpose
Full HTML document loaded inside the VSCode Webview panel. Provides the structural shell for the agent dashboard: header, agent grid, status bar, and placeholder slots where the TypeScript extension injects CSS and JavaScript content via `{{...}}` template markers.

## Data flow
```
petsPanel.ts _getHtmlContent()
    │
    ├── Reads pets.html from disk
    ├── Reads theme.css from disk
    ├── Reads palette.js, sprites.js, state.js, renderer.js, main.js from disk
    │
    └── Replaces placeholders:
          {{nonce}}      → CSP nonce (64-char random string)
          {{port}}       → Event server port number
          {{THEME_CSS}}  → Inlined theme.css content
          {{PALETTE_JS}} → Inlined palette.js content
          {{SPRITES_JS}} → Inlined sprites.js content
          {{STATE_JS}}   → Inlined state.js content
          {{RENDERER_JS}}→ Inlined renderer.js content
          {{MAIN_JS}}    → Inlined main.js content
    │
    ▼
  Full HTML returned → assigned to panel.webview.html
```

## Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="port" content="{{port}}">     <!-- Read by main.js for SSE connection -->
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                 style-src 'unsafe-inline';
                 script-src 'nonce-{{nonce}}';
                 connect-src http://localhost:{{port}};">
  <style>{{THEME_CSS}}</style>
</head>
<body>
  <div id="app">
    <header>
      <span class="title">✦ OpenCode Pets</span>
      <span class="agent-count" id="agentCount">0 agents</span>
    </header>
    <div id="pet-grid"></div>         <!-- Agent canvases injected by main.js -->
    <footer id="status-bar">
      <span id="eventDetail">Waiting for events...</span>
    </footer>
  </div>

  <!-- Scripts injected in dependency order -->
  <script nonce="{{nonce}}">{{PALETTE_JS}}</script>
  <script nonce="{{nonce}}">{{SPRITES_JS}}</script>
  <script nonce="{{nonce}}">{{STATE_JS}}</script>
  <script nonce="{{nonce}}">{{RENDERER_JS}}</script>
  <script nonce="{{nonce}}">{{MAIN_JS}}</script>
</body>
</html>
```

## Key elements

| Element ID / Class | Purpose |
|-------------------|---------|
| `meta[name="port"]` | Stores server port for `main.js` to read |
| `#app` | Root flex container (column layout) |
| `header` | Title bar with agent count |
| `#pet-grid` | Flex-wrap grid container; agent cells injected by JS |
| `.agent-cell` | Created dynamically per agent (canvas + labels) |
| `#status-bar` / `#eventDetail` | Footer showing latest event detail text |

## Content-Security-Policy
- `default-src 'none'` — Block all by default
- `style-src 'unsafe-inline'` — Required for VSCode Webview inline styles
- `script-src 'nonce-{{nonce}}'` — Only scripts with correct nonce execute
- `connect-src http://localhost:{{port}}` — Allow SSE connection to embedded server

## Dependencies
- **Template variables are provided by**: `petsPanel.ts` `_getHtmlContent()`
- **CSS**: `theme.css` (inlined into `<style>`)
- **JS (in order)**: `palette.js`, `sprites.js`, `state.js`, `renderer.js`, `main.js`

## Usage example
Not used directly — this is a template file read from disk by `petsPanel.ts` and rendered inside the Webview.

## State management
None. Pure HTML template with no runtime logic.

## Edge cases
- **Missing placeholders**: If a `{{...}}` placeholder is not replaced, the raw text appears in the panel (mitigated by `replace()` calls in `_getHtmlContent`)
- **CSP violation**: If scripts lack the correct nonce, they fail to execute (mitigated by nonce generation + replacement)

## Acceptance Criteria covered
- **AC1**: Panel loads agents when opened via command
- **AC6**: Theme styles adapt via VSCode CSS variables in `theme.css`

## Reference
- [Implementation Plan](../../current/implementation-plan.md) — Component 4
- [Specification](../../../spec.md) — §4.4 `pets.html`
