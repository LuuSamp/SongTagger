import type { Source } from './types'

export type EmbedProvider = 'spotify' | 'youtube' | 'apple_music'

export interface Embed {
  provider: EmbedProvider
  id: string
  label: string
  src: string
  height: number | null
}

export const EMBED_ORDER: readonly EmbedProvider[] = ['spotify', 'youtube', 'apple_music']

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/
const YOUTUBE_ID = /^[\w-]{11}$/
const APPLE_ID = /^\d+$/
const APPLE_STOREFRONT = /music\.apple\.com\/([a-z]{2})\//i

export function embedFor(source: Source): Embed | null {
  const id = source.external_id.trim()
  if (source.name === 'spotify' && SPOTIFY_ID.test(id)) {
    return {
      provider: 'spotify',
      id,
      label: 'Spotify',
      src: `https://open.spotify.com/embed/track/${id}?utm_source=songtagger`,
      height: 352,
    }
  }
  if (source.name === 'youtube' && YOUTUBE_ID.test(id)) {
    return {
      provider: 'youtube',
      id,
      label: 'YouTube',
      src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`,
      height: null,
    }
  }
  if (source.name === 'apple_music' && APPLE_ID.test(id)) {
    const storefront = APPLE_STOREFRONT.exec(source.url)?.[1]?.toLowerCase() ?? 'us'
    return {
      provider: 'apple_music',
      id,
      label: 'Apple Music',
      src: `https://embed.music.apple.com/${storefront}/song/${id}`,
      height: 175,
    }
  }
  return null
}

export function embeddableSources(sources: readonly Source[]): Embed[] {
  const embeds = new Map<EmbedProvider, Embed>()
  for (const source of sources) {
    const embed = embedFor(source)
    if (embed && !embeds.has(embed.provider)) {
      embeds.set(embed.provider, embed)
    }
  }
  return EMBED_ORDER.flatMap((provider) => {
    const embed = embeds.get(provider)
    return embed ? [embed] : []
  })
}
