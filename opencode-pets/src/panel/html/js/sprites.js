// Sprites from the reference multi-agents project — single robot design with 7 states
// All sprites share the same format: fps + 2 frames, each 11 rows x 12 cols

const sprites = {
  idle: { fps: 2, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBS_S_SBB__',
      '_BBS_S_SBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
  ]},
  happy: { fps: 3, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSUUSUBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSUUUSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '___B_B_B____',
      '__B_____B___',
    ],
  ]},
  error: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBXEXEXBB__',
      '_BBXEXEXBB__',
      '_BBSSSSSBB__',
      '_BBSoooSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBX_X_XBB__',
      '_BBX_X_XBB__',
      '_BBSSSSSBB__',
      '_BBSoooSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
  ]},
  thinking: { fps: 2, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMCMBBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSM_MSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
  ]},
  write: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '__Y_B_B_____',
      '_Y__B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '_Y__B_B_____',
      'Y___B___B___',
    ],
  ]},
  read: { fps: 3, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBoEoEoBB__',
      '_BBoEoEoBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '__W_B_B_____',
      '_WW_B___B___',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBoEoEoBB__',
      '_BBoEoEoBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '___BBGBB____',
      '____BGB_____',
      '_W__B_B_____',
      'WW__B___B___',
    ],
  ]},
  bash: { fps: 4, frames: [
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__BBBGBBB___',
      '_A_BBGBB____',
      '_A__BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
    [
      '____BBBB____',
      '__BBBBBBBB__',
      '_BBSESESBB__',
      '_BBSESESBB__',
      '_BBSSSSSBB__',
      '_BBSMSMSBB__',
      '__LABGBAB___',
      '_ALBBGBB____',
      '_A__BGB_____',
      '____B_B_____',
      '___B___B____',
    ],
  ]},
}

// ── Helper: derive per-agent sprites from the base robot ──────────
/**
 * Derive a complete 7-state sprite set for an agent by:
 *  1) Replacing the body color key B → bodyKey and b → shadowKey
 *  2) Overlaying accessory characters on specified rows
 *
 * @param {string} bodyKey    Single-char body color (e.g. 'T', 'U', 'H')
 * @param {string} shadowKey  Single-char body shadow (e.g. 't', 'u', 'h')
 * @param {object} overlays   { default?: { rowIndex: 'overlay12chars' },
 *                              stateName?: { rowIndex: 'overlay12chars' } }
 * @returns {object} sprite set shaped like the base `sprites` object
 */
function deriveAgentSprites(bodyKey, shadowKey, overlays) {
  const result = {}
  const BASE_STATES = Object.keys(sprites)
  for (const stateName of BASE_STATES) {
    const base = sprites[stateName]
    const rowOverlays = overlays[stateName] || overlays.default || {}
    const frames = base.frames.map(frame =>
      frame.map((row, rowIdx) => {
        // Step 1 — replace body color characters
        let newRow = row.replace(/B/g, bodyKey).replace(/b/g, shadowKey)
        // Step 2 — overlay accessory pixels
        const overlay = rowOverlays[rowIdx]
        if (overlay) {
          for (let col = 0; col < overlay.length && col < newRow.length; col++) {
            const ch = overlay[col]
            if (ch !== '_') {
              newRow = newRow.substring(0, col) + ch + newRow.substring(col + 1)
            }
          }
        }
        return newRow
      })
    )
    result[stateName] = { fps: base.fps, frames }
  }
  return result
}

// ── Accessory definitions (pixel overlays) for each agent ─────────
// Each value is a map of { rowIndex: '12-char-overlay-string' }
// '_'  means "keep original pixel"; any other character overwrites.
const AGENT_ACCESSORIES = {
  explore: { default: {
    2: 'OO__________',
    3: 'OO__________',
    4: '_O__________',
    5: '__O_________',
  }},
  general: { default: {
    3: '___________F',
    4: '__________FF',
    5: '___________F',
  }},
  'ssd-planner': { default: {
    5: '____W_W_____',
    6: '____WWWW____',
    7: '____WWWW____',
  }},
  'ssd-spec-writer': { default: {
    2: '__________W_',
    3: '_________W__',
    4: '________W___',
    5: '_______W____',
    6: '______s_____',
  }},
  'ssd-implementer': { default: {
    2: '_________F__',
    3: '_________FO_',
    4: '_________F__',
    5: '__________O_',
  }},
  'ssd-tester': { default: {
    3: '_D__________',
    4: 'DDD_________',
    5: 'D_D_________',
    6: 'D_D_________',
    7: 'DDD_________',
  }},
  'ssd-reviewer': { default: {
    2: '____DD_DD___',
    3: '____DD_DD___',
  }},
  'ssd-docs-writer': { default: {
    5: '___WWWW_____',
    6: '__WWWWWW____',
    7: '__WWWWWW____',
    8: '___WWWW_____',
  }},
  'ssd-validator': { default: {
    0: '_____L______',
    1: '______L_____',
  }},
  'ssd-orchestrator': { default: {
    0: '___YYYY_____',
    1: '__YNNNNY____',
  }},
}

// ── Body / shadow key per agent ───────────────────────────────────
// (agentId → [ bodyKey, shadowKey ])
const AGENT_BODY_KEYS = {
  explore:          ['T', 't'],
  general:          ['U', 'u'],
  'ssd-planner':    ['B', 'b'],
  'ssd-spec-writer':['V', 'v'],
  'ssd-implementer':['H', 'h'],
  'ssd-tester':     ['X', 'x'],
  'ssd-reviewer':   ['J', 'j'],
  'ssd-docs-writer':['Z', 'z'],
  'ssd-validator':  ['C', 'c'],
  'ssd-orchestrator':['N', 'n'],
}

// ── Build per-agent sprite sets ──────────────────────────────────
const agentSprites = {}
for (const [agentId, [bodyKey, shadowKey]] of Object.entries(AGENT_BODY_KEYS)) {
  const acc = AGENT_ACCESSORIES[agentId] || { default: {} }
  agentSprites[agentId] = deriveAgentSprites(bodyKey, shadowKey, acc)
}

// Agent definitions — all 10 opencode agent types
const AGENTS = [
  { id: 'explore',     name: 'Explore',          color: '#4AB0B0' },
  { id: 'general',     name: 'General',          color: '#7A8AA0' },
  { id: 'ssd-planner', name: 'SSD-Planner',      color: '#4A6FA5' },
  { id: 'ssd-spec-writer', name: 'SSD-Spec-Writer', color: '#8A5EA5' },
  { id: 'ssd-implementer', name: 'SSD-Implementer', color: '#4A9A6A' },
  { id: 'ssd-tester',  name: 'SSD-Tester',        color: '#D08030' },
  { id: 'ssd-reviewer', name: 'SSD-Reviewer',     color: '#D0608A' },
  { id: 'ssd-docs-writer', name: 'SSD-Docs-Writer', color: '#8B6E4A' },
  { id: 'ssd-validator', name: 'SSD-Validator',   color: '#40C0D0' },
  { id: 'ssd-orchestrator', name: 'SSD-Orchestrator', color: '#D4A030' },
]

/**
 * Get sprite for an agent+state combination.
 * Phase 3: checks per-agent sprites first, falls back to default robot.
 * Falls back to idle if state is missing.
 * @param {string|null} agentId
 * @param {string} stateName
 * @returns {object} sprite object with fps and frames
 */
function getSprite(agentId, stateName) {
  if (agentId && agentSprites[agentId]) {
    return agentSprites[agentId][stateName] || agentSprites[agentId].idle || sprites.idle
  }
  return sprites[stateName] || sprites.idle
}
