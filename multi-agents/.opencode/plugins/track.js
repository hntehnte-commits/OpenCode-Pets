const SERVER = 'http://localhost:3001/event'

async function send(type, data) {
  try {
    await fetch(SERVER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, time: Date.now() }),
    })
  } catch {}
}

export const TrackPlugin = async () => {
  send('plugin.loaded', {})

  return {
    'tool.execute.before': async (input, output) => {
      send('tool.start', { tool: input.tool, args: output.args })
    },
    'tool.execute.after': async (input, result) => {
      send('tool.end', { tool: input.tool })
    },
    event: async ({ event }) => {
      if (['session.created', 'session.idle', 'session.error'].includes(event.type)) {
        send('session', { type: event.type })
      }
    },
    stop: async () => {
      send('session', { type: 'session.stopped' })
    },
  }
}
