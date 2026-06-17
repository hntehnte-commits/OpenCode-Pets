import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { EventServer } from './server/eventServer'
import { PetsPanel } from './panel/petsPanel'
import { writePortFile, removePortFile } from './utils/portFile'

let eventServer: EventServer

/**
 * Copy the opencode plugin to ~/.opencode/plugins/ so opencode can load it.
 * Only copies if the destination does NOT already exist (preserves manual updates).
 */
async function copyPluginToUserDir(extensionPath: string): Promise<void> {
  const src = path.join(extensionPath, '.opencode', 'plugins', 'dashboard.js')
  const dstDir = path.join(require('os').homedir(), '.opencode', 'plugins')
  const dst = path.join(dstDir, 'dashboard.js')

  try {
    await fs.promises.mkdir(dstDir, { recursive: true })
    // Only copy if destination doesn't exist (user may have manually updated it)
    try {
      await fs.promises.access(dst, fs.constants.F_OK)
      console.log('[OpenCode Pets] Plugin already exists at', dst, '— skipping copy')
      return
    } catch {
      // File doesn't exist, safe to copy
    }
    await fs.promises.copyFile(src, dst)
    console.log('[OpenCode Pets] Plugin copied to', dst)
  } catch (err: any) {
    console.warn('[OpenCode Pets] Could not copy plugin:', err.message)
  }
}

/**
 * Called by VSCode when the extension is activated.
 * Starts the embedded event server and registers commands.
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[OpenCode Pets] Activating extension...')

  // ── Copy plugin so opencode can load it ──
  copyPluginToUserDir(context.extensionPath)

  // ── Start embedded event server ──
  eventServer = new EventServer()
  const configPort = vscode.workspace
    .getConfiguration('opencodePets')
    .get<number>('serverPort', 3001)

  eventServer
    .start(configPort)
    .then((port: number) => {
      console.log(`[OpenCode Pets] Event server listening on port ${port}`)
      vscode.window.setStatusBarMessage(
        `OpenCode Pets: Server running on port ${port}`,
        3000
      )
    })
    .catch((err: Error) => {
      console.error('[OpenCode Pets] Failed to start event server:', err.message)
      vscode.window.showWarningMessage(
        `OpenCode Pets: Could not start event server — ${err.message}`
      )
    })

  // ── Register commands ──
  const showPanelCmd = vscode.commands.registerCommand(
    'opencode-pets.showPanel',
    () => {
      PetsPanel.createOrShow(eventServer, context).catch((err: Error) => {
        console.error('[OpenCode Pets] Failed to show panel:', err.message)
      })
    }
  )
  context.subscriptions.push(showPanelCmd)

  const selectSessionCmd = vscode.commands.registerCommand(
    'opencode-pets.selectSession',
    () => {
      PetsPanel.selectSession(eventServer, context)
    }
  )
  context.subscriptions.push(selectSessionCmd)

  console.log('[OpenCode Pets] Extension activated')
}

/**
 * Called by VSCode when the extension is deactivated.
 * Stops the event server and disposes of the panel.
 */
export function deactivate(): void {
  console.log('[OpenCode Pets] Deactivating extension...')

  if (eventServer) {
    eventServer.stop()
  }

  // Clean up port file
  removePortFile().catch(() => {})

  if (PetsPanel.currentPanel) {
    PetsPanel.currentPanel.dispose()
  }

  console.log('[OpenCode Pets] Extension deactivated')
}
