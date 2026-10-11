import { describe, expect, it } from 'vitest'
import { spotifyPlaying, youTubeStateFromMessage } from './playback'

describe('youTubeStateFromMessage', () => {
  it('reads player state from infoDelivery and onStateChange messages', () => {
    expect(
      youTubeStateFromMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } })),
    ).toBe(true)
    expect(youTubeStateFromMessage({ event: 'infoDelivery', info: { playerState: 2 } })).toBe(false)
    expect(youTubeStateFromMessage(JSON.stringify({ event: 'onStateChange', info: 0 }))).toBe(false)
    expect(youTubeStateFromMessage(JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(true)
  })

  it('ignores buffering, unrelated and malformed messages', () => {
    expect(youTubeStateFromMessage({ event: 'onStateChange', info: 3 })).toBeNull()
    expect(youTubeStateFromMessage({ event: 'infoDelivery', info: { currentTime: 12 } })).toBeNull()
    expect(youTubeStateFromMessage({ event: 'onReady' })).toBeNull()
    expect(youTubeStateFromMessage('not json')).toBeNull()
    expect(youTubeStateFromMessage(null)).toBeNull()
  })
})

describe('spotifyPlaying', () => {
  it('maps playback_update events to a playing flag', () => {
    expect(spotifyPlaying({ data: { isPaused: false, isBuffering: false } })).toBe(true)
    expect(spotifyPlaying({ data: { isPaused: true } })).toBe(false)
  })

  it('ignores buffering and malformed events', () => {
    expect(spotifyPlaying({ data: { isPaused: false, isBuffering: true } })).toBeNull()
    expect(spotifyPlaying({ data: {} })).toBeNull()
    expect(spotifyPlaying(undefined)).toBeNull()
  })
})
