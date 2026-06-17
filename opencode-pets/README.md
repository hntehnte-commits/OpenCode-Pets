# OpenCode Pets

**Pixel-art agent dashboard for opencode sessions** — a VSCode extension that shows agent activity as animated pixel characters directly in your editor.

![Screenshot](docs/screenshot.png)
<!-- TODO: Add a real screenshot once the extension is functional -->

## Features

- **10 pixel-art agents** — one for each opencode agent type (explore, general, ssd-planner, ssd-spec-writer, ssd-implementer, ssd-tester, ssd-reviewer, ssd-docs-writer, ssd-validator, ssd-orchestrator)
- **Real-time state animation** — agents react with idle, happy, error, thinking, write, read, and bash animations
- **Works with existing `track.js` plugin** — connects to port 3001, no configuration needed
- **VSCode theme-aware** — automatically adapts to light and dark themes using VSCode CSS variables
- **Zero runtime dependencies** — uses only Node.js built-in `http` module and Canvas 2D API

## Requirements

- **VSCode** ^1.85.0

## Installation

### From VSIX

1. Download the latest `.vsix` from the [releases page](https://github.com/opencode-ai/opencode-dashboard-extension/releases).
2. Run:
   ```bash
   code --install-extension opencode-pets-1.0.0.vsix
   ```

### From VSCode Marketplace

Search for **"OpenCode Pets"** in the Extensions view (`Ctrl+Shift+X`) and click Install.

## Usage

1. **Install** the extension (see above).
2. Open the **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`).
3. Run **"OpenCode Pets: Show Agent Dashboard"**.
4. A Webview panel opens showing all 10 agents animating with their idle animation.
5. Use opencode normally — agents react to tool events (read, write, bash, etc.) in real time.

> **Tip:** The extension embeds its own HTTP server on port 3001 (configurable). Make sure the opencode `track.js` plugin sends events to this port.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `opencodePets.serverPort` | `3001` | Port for the embedded event server (receives `POST /event` from opencode plugin) |
| `opencodePets.pixelScale` | `8` | Pixel size for sprite rendering (affects agent canvas size; range 4–24) |
| `opencodePets.showLabels` | `true` | Show agent name and state labels below each character |

## Architecture

```
opencode session
    │
    ▼
.opencode/plugins/track.js   (hooks tool events, sends POST /event)
    │
    ▼
src/server/eventServer.js    (embedded HTTP + SSE server, port 3001)
    │
    ├── POST /event  → update per-agent state
    └── SSE /stream  → push state to Webview
         │
         ▼
src/panel/html/              (Webview: HTML + JS + CSS)
    ├── main.js              (init, SSE client, message routing)
    ├── renderer.js          (Canvas 2D drawing engine)
    ├── sprites.js           (10 agents × 7 states sprite definitions)
    ├── state.js             (per-agent state queues + event mapping)
    ├── palette.js           (16-color palette)
    └── theme.css            (VSCode theme variables)
```

## Documentation

Detailed module documentation is available in `documentation/docs/`.

## Development Setup

```bash
git clone https://github.com/opencode-ai/opencode-dashboard-extension.git
cd opencode-pets
npm install
npm run compile
```

Press **`F5`** in VSCode to launch the extension development host. The extension activates when you run the "OpenCode Pets: Show Agent Dashboard" command.

### Building VSIX

To create a `.vsix` package for distribution:

```bash
npm run package
```

The output file (`opencode-pets-1.0.0.vsix`) will be in the project root.

## License

MIT
