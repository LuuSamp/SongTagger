import { describe, expect, it } from 'vitest'
import { embedFor, embeddableSources } from './embeds'

const spotify = {
  name: 'spotify',
  external_id: '0DiWol3AO6WpXZgp0goxAV',
  url: 'https://open.spotify.com/track/0DiWol3AO6WpXZgp0goxAV',
}
const youtube = {
  name: 'youtube',
  external_id: '-SaUrDhp034',
  url: 'https://music.youtube.com/watch?v=-SaUrDhp034',
}
const apple = {
  name: 'apple_music',
  external_id: '1097861770',
  url: 'https://music.apple.com/gb/song/1097861770',
}
const musicbrainz = {
  name: 'musicbrainz',
  external_id: 'abc',
  url: 'https://musicbrainz.org/recording/abc',
}

describe('embed urls', () => {
  it('builds provider embed urls from stored ids', () => {
    expect(embedFor(spotify)?.src).toBe(
      'https://open.spotify.com/embed/track/0DiWol3AO6WpXZgp0goxAV?utm_source=songtagger',
    )
    expect(embedFor(youtube)?.src).toBe(
      'https://www.youtube-nocookie.com/embed/-SaUrDhp034?autoplay=1&rel=0',
    )
    expect(embedFor(apple)?.src).toBe('https://embed.music.apple.com/gb/song/1097861770')
  })

  it('defaults the Apple storefront and rejects malformed ids', () => {
    expect(embedFor({ ...apple, url: 'https://example.com/x' })?.src).toBe(
      'https://embed.music.apple.com/us/song/1097861770',
    )
    expect(embedFor({ ...spotify, external_id: 'short' })).toBeNull()
    expect(embedFor({ ...youtube, external_id: 'x"><script>' })).toBeNull()
    expect(embedFor({ ...apple, external_id: '12a' })).toBeNull()
    expect(embedFor(musicbrainz)).toBeNull()
  })

  it('orders embeddable sources Spotify, YouTube, Apple Music', () => {
    expect(
      embeddableSources([apple, musicbrainz, youtube, spotify]).map((e) => e.provider),
    ).toEqual(['spotify', 'youtube', 'apple_music'])
    expect(embeddableSources([musicbrainz])).toEqual([])
  })
})
