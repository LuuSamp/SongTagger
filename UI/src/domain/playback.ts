const YOUTUBE_PLAYING = 1
const YOUTUBE_BUFFERING = 3

function parse(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data
  }
  try {
    return JSON.parse(data) as unknown
  } catch {
    return null
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function fromYouTubeState(state: unknown): boolean | null {
  if (typeof state !== 'number' || state === YOUTUBE_BUFFERING) {
    return null
  }
  return state === YOUTUBE_PLAYING
}

export function youTubeStateFromMessage(data: unknown): boolean | null {
  const message = asRecord(parse(data))
  if (!message) {
    return null
  }
  if (message.event === 'onStateChange') {
    return fromYouTubeState(message.info)
  }
  if (message.event === 'infoDelivery' || message.event === 'initialDelivery') {
    const info = asRecord(message.info)
    return info && 'playerState' in info ? fromYouTubeState(info.playerState) : null
  }
  return null
}

export function spotifyPlaying(event: unknown): boolean | null {
  const data = asRecord(asRecord(event)?.data)
  if (!data || typeof data.isPaused !== 'boolean') {
    return null
  }
  if (data.isBuffering === true) {
    return null
  }
  return !data.isPaused
}
