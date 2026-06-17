import * as vscode from 'vscode'
import { EventServer } from '../server/eventServer'

/**
 * @fileoverview Session selection state and QuickPick UI for multi-terminal support.
 *
 * When multiple opencode terminals are active, the user can choose which
 * session to track via a QuickPick dialog. The selection is persisted in
 * VSCode workspaceState across restarts.
 */

export interface SessionSummary {
  id: string
  label?: string
  lastSeen: number
  createdAt: number
  agentCount: number
}

/**
 * Manages session selection — fetching active sessions from the server,
 * showing the QuickPick dialog, and persisting the user's choice.
 */
export class SessionManager {
  constructor(private eventServer: EventServer) {}

  /**
   * Fetch active sessions from the event server.
   * Returns sessions that have had events in the last 5 minutes.
   */
  async getActiveSessions(): Promise<SessionSummary[]> {
    try {
      return this.eventServer.getSessions()
    } catch {
      return []
    }
  }

  /**
   * Show VSCode QuickPick dialog for session selection.
   *
   * @returns The selected session ID, or `null` for "Show All",
   *          or `undefined` if the user cancelled.
   */
  async showSessionPicker(): Promise<string | null | undefined> {
    const sessions = await this.getActiveSessions()
    if (sessions.length === 0) {
      vscode.window.showInformationMessage('No active opencode sessions found.')
      return undefined
    }

    const items: (vscode.QuickPickItem & { sessionId: string | null })[] = sessions.map((s) => {
      const label = s.label
        ? `$(terminal) ${s.label}`
        : `$(terminal) Session ${s.id.slice(0, 8)}…`
      const agentWord = s.agentCount === 1 ? 'agent' : 'agents'
      const lastSeen = this._formatRelativeTime(s.lastSeen)
      return {
        label,
        description: `${s.agentCount} ${agentWord} • active ${lastSeen}`,
        sessionId: s.id,
      }
    })

    // Add "Show All" option if there's more than one session
    if (sessions.length > 1) {
      items.push({
        label: '$(symbol-event) Show All Sessions',
        description: 'View events from all terminals',
        sessionId: null,
      })
    }

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select opencode session to track',
      ignoreFocusOut: false,
    })

    return picked ? picked.sessionId : undefined
  }

  /**
   * Get the persisted session ID from workspace state.
   */
  getPersistedSession(context: vscode.ExtensionContext): string | null {
    return context.workspaceState.get<string | null>('opencodePets.selectedSession', null)
  }

  /**
   * Persist the selected session ID to workspace state.
   */
  persistSession(context: vscode.ExtensionContext, sessionId: string | null): void {
    context.workspaceState.update('opencodePets.selectedSession', sessionId)
  }

  /**
   * Check if a session is still active (has recent events).
   */
  isSessionActive(sessionId: string): boolean {
    const sessions = this.eventServer.getSessions()
    return sessions.some((s) => s.id === sessionId)
  }

  /**
   * Format a timestamp as a relative time string (e.g., "2s ago", "5m ago").
   * @private
   */
  private _formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const seconds = Math.floor(diff / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }
}
