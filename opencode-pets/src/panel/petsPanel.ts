import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { EventServer } from '../server/eventServer'
import { SessionManager } from './sessionManager'

/**
 * Manages the WebviewPanel for the OpenCode Pets dashboard.
 * Creates or reveals the panel, assembles the HTML with inlined JS/CSS,
 * and relays events between the extension host and the Webview.
 */
export class PetsPanel {
  public static currentPanel: PetsPanel | undefined
  private readonly _panel: vscode.WebviewPanel
  private readonly _disposables: vscode.Disposable[] = []
  private _selectedSessionId: string | null = null
  private _sessionManager: SessionManager

  private constructor(
    panel: vscode.WebviewPanel,
    eventServer: EventServer,
    context: vscode.ExtensionContext,
    selectedSessionId: string | null
  ) {
    this._panel = panel
    this._selectedSessionId = selectedSessionId
    this._sessionManager = new SessionManager(eventServer)
    panel.webview.html = this._getHtmlContent(context, eventServer)

    // Send initial session selection to Webview
    panel.webview.postMessage({
      type: 'sessionSelected',
      sessionId: selectedSessionId,
    })

    // Handle messages from the Webview
    panel.webview.onDidReceiveMessage(
      (msg) => {
        switch (msg.type) {
          case 'ready':
            console.log('[OpenCode Pets] Webview panel ready')
            // Re-send session selection in case Webview re-loaded
            panel.webview.postMessage({
              type: 'sessionSelected',
              sessionId: this._selectedSessionId,
            })
            break
          case 'selectSession':
            // User clicked session indicator in Webview
            PetsPanel.selectSession(eventServer, context)
            break
        }
      },
      null,
      this._disposables
    )

    // Forward events from the event server to the Webview (SSE fallback path)
    // and also relay active sessions list periodically
    eventServer.onEvent((state: any) => {
      if (this._panel) {
        this._panel.webview.postMessage({
          type: 'event',
          data: state,
          time: Date.now(),
          sessionId: state.sessionId || null,
          eventId: 'ext-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        })
      }
    })

    // Clean up when panel is closed
    panel.onDidDispose(
      () => this.dispose(),
      null,
      this._disposables
    )
  }

  /**
   * Create or reveal the Webview panel.
   * If the panel already exists, it is revealed in the active column.
   * If multiple active sessions are detected, shows a QuickPick for selection.
   */
  static async createOrShow(
    eventServer: EventServer,
    context: vscode.ExtensionContext
  ): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    // If panel already exists, just reveal it (retainContextWhenHidden preserves the JS state)
    if (PetsPanel.currentPanel) {
      PetsPanel.currentPanel._panel.reveal(column || vscode.ViewColumn.One)
      return  // Don't reassign webview.html — retainContextWhenHidden preserves state
    }

    // Determine which session to track
    const sessionManager = new SessionManager(eventServer)
    let selectedSessionId: string | null = null

    // Try restored session first
    const restoredId = sessionManager.getPersistedSession(context)
    if (restoredId && sessionManager.isSessionActive(restoredId)) {
      selectedSessionId = restoredId
    } else {
      // Check active sessions
      const sessions = await sessionManager.getActiveSessions()
      if (sessions.length === 1) {
        selectedSessionId = sessions[0].id
      } else if (sessions.length >= 2) {
        const picked = await sessionManager.showSessionPicker()
        if (picked !== undefined) {
          selectedSessionId = picked
        }
      }
      // If no sessions or user cancelled, selectedSessionId stays null (show all)
    }

    // Persist the selection
    sessionManager.persistSession(context, selectedSessionId)

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      'opencodePets.panel',
      'OpenCode Pets',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    )

    panel.iconPath = new vscode.ThemeIcon('symbol-icon')

    PetsPanel.currentPanel = new PetsPanel(panel, eventServer, context, selectedSessionId)
  }

  /**
   * Show the session selection QuickPick and update the panel.
   */
  static async selectSession(
    eventServer: EventServer,
    context?: vscode.ExtensionContext
  ): Promise<void> {
    const sessionManager = new SessionManager(eventServer)
    const picked = await sessionManager.showSessionPicker()
    if (picked === undefined) return // User cancelled

    // Persist the selection
    if (context) {
      sessionManager.persistSession(context, picked)
    }

    // Update current panel
    if (PetsPanel.currentPanel) {
      PetsPanel.currentPanel._selectedSessionId = picked
      PetsPanel.currentPanel._panel.webview.postMessage({
        type: 'sessionSelected',
        sessionId: picked,
      })
    }
  }

  /**
   * Dispose of the panel and clean up resources.
   */
  dispose(): void {
    PetsPanel.currentPanel = undefined
    this._panel.dispose()
    while (this._disposables.length) {
      const d = this._disposables.pop()
      if (d) {
        d.dispose()
      }
    }
  }

  /**
   * Build the full HTML for the Webview.
   * Reads the HTML template, CSS, and JS files from disk,
   * replaces placeholders, and returns the complete HTML string.
   */
  private _getHtmlContent(
    context: vscode.ExtensionContext,
    eventServer: EventServer
  ): string {
    const nonce = this._getNonce()
    const config = vscode.workspace.getConfiguration('opencodePets')
    const port = eventServer.getPort() || config.get<number>('serverPort', 3001)

    const htmlPath = path.join(
      context.extensionPath,
      'src',
      'panel',
      'html',
      'pets.html'
    )
    const cssPath = path.join(
      context.extensionPath,
      'src',
      'panel',
      'html',
      'css',
      'theme.css'
    )
    const jsDir = path.join(
      context.extensionPath,
      'src',
      'panel',
      'html',
      'js'
    )

    // Read template files
    let html: string
    let css: string
    try {
      html = fs.readFileSync(htmlPath, 'utf-8')
      css = fs.readFileSync(cssPath, 'utf-8')
    } catch (err) {
      console.error('[OpenCode Pets] Failed to read HTML/CSS:', err)
      return this._getFallbackHtml(nonce)
    }

    // Read and inline JS files in dependency order
    const jsFiles = [
      'palette.js',
      'sprites.js',
      'state.js',
      'renderer.js',
      'main.js',
    ]
    const jsContent: Record<string, string> = {}

    for (const file of jsFiles) {
      const filePath = path.join(jsDir, file)
      try {
        jsContent[file.replace('.js', '').toUpperCase()] = fs.readFileSync(
          filePath,
          'utf-8'
        )
      } catch (err) {
        console.error(`[OpenCode Pets] Failed to read ${file}:`, err)
        jsContent[file.replace('.js', '').toUpperCase()] =
          'console.error("Failed to load ' + file + '")'
      }
    }

    // Replace placeholders
    html = html.replace(/\{\{nonce\}\}/g, nonce)
    html = html.replace(/\{\{port\}\}/g, String(port))
    html = html.replace('{{THEME_CSS}}', css)
    html = html.replace('{{PALETTE_JS}}', jsContent['PALETTE'] || '')
    html = html.replace('{{SPRITES_JS}}', jsContent['SPRITES'] || '')
    html = html.replace('{{STATE_JS}}', jsContent['STATE'] || '')
    html = html.replace('{{RENDERER_JS}}', jsContent['RENDERER'] || '')
    html = html.replace('{{MAIN_JS}}', jsContent['MAIN'] || '')

    return html
  }

  /**
   * Fallback HTML in case the template files cannot be read.
   */
  private _getFallbackHtml(nonce: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
    body { background: #1e1e1e; color: #ccc; font-family: sans-serif;
           display: flex; align-items: center; justify-content: center;
           height: 100vh; }
  </style>
</head>
<body>
  <p>OpenCode Pets: Failed to load panel assets.</p>
</body>
</html>`
  }

  /**
   * Generate a 64-character random nonce for CSP.
   */
  private _getNonce(): string {
    const possible =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    let text = ''
    for (let i = 0; i < 64; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
  }
}
