const fs = require('fs')
const path = require('path')
const os = require('os')

/**
 * @fileoverview Read/write ~/.opencode/dashboard.json for port discovery.
 *
 * The extension writes its actual listening port to this file so the
 * opencode plugin can discover the correct URL instead of relying on
 * a hardcoded port (3001).
 *
 * @see spec.md §4.4
 */

/**
 * Resolved path to the dashboard port file.
 * Cross-platform: Linux/Mac → $HOME/.opencode/dashboard.json
 *                  Windows → %USERPROFILE%\.opencode\dashboard.json
 */
const PORT_FILE_PATH = path.join(os.homedir(), '.opencode', 'dashboard.json')

/**
 * Write port information to ~/.opencode/dashboard.json.
 * Creates the ~/.opencode/ directory if it does not exist.
 *
 * @param {number} port - The actual listening port
 * @returns {Promise<void>}
 */
async function writePortFile(port) {
  const dir = path.dirname(PORT_FILE_PATH)
  await fs.promises.mkdir(dir, { recursive: true })

  const data = {
    port,
    pid: process.pid,
    startedAt: Date.now(),
    version: 1,
  }

  await fs.promises.writeFile(PORT_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Read port information from ~/.opencode/dashboard.json.
 *
 * @returns {Promise<{port: number, pid: number, startedAt: number, version: number} | null>}
 *   Parsed file content, or null if the file is missing or malformed.
 */
async function readPortFile() {
  try {
    const raw = await fs.promises.readFile(PORT_FILE_PATH, 'utf-8')
    const data = JSON.parse(raw)
    if (typeof data.port !== 'number') {
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Delete the dashboard port file.
 * Succeeds silently if the file does not exist.
 *
 * @returns {Promise<void>}
 */
async function removePortFile() {
  try {
    await fs.promises.unlink(PORT_FILE_PATH)
  } catch {
    // File already absent — nothing to clean up
  }
}

module.exports = { PORT_FILE_PATH, writePortFile, readPortFile, removePortFile }
