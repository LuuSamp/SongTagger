import {
  siApplemusic,
  siDiscogs,
  siMusicbrainz,
  siSpotify,
  siYoutube,
  type SimpleIcon,
} from 'simple-icons'

const BRAND_ICONS: Record<string, SimpleIcon> = {
  spotify: siSpotify,
  apple_music: siApplemusic,
  youtube: siYoutube,
  musicbrainz: siMusicbrainz,
  discogs: siDiscogs,
}

const LOW_CONTRAST_BRANDS = new Set(['discogs'])

export function brandIcon(sourceName: string): SimpleIcon | null {
  return BRAND_ICONS[sourceName] ?? null
}

export function brandColor(sourceName: string): string {
  const icon = brandIcon(sourceName)
  if (!icon || LOW_CONTRAST_BRANDS.has(sourceName)) {
    return 'var(--color-ink)'
  }
  return `#${icon.hex}`
}
