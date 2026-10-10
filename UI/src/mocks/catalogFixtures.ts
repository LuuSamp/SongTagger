import { toToken } from '../domain/tags'
import type { Source, TagKind } from '../domain/types'

export interface FixtureTagApplication {
  kind: TagKind
  name: string
  appliedBy: string
}

export interface FixtureSong {
  id: number
  title: string
  artist_credit: string
  duration_ms: number | null
  mbid: string | null
  isrc: string | null
  disambiguation: string | null
  sources: Source[]
  tags: FixtureTagApplication[]
}

export const MOCK_CATALOG_USER = 'catalog'
export const MOCK_COMMUNITY_USER = 'community'

interface FixtureInput {
  id: number
  title: string
  artist: string
  durationMs: number
  isrc?: string
  disambiguation?: string
  genres: string[]
  community?: Array<[TagKind, string]>
  listenOn?: Array<'spotify' | 'apple_music' | 'youtube'>
}

const LISTEN_URLS: Record<'spotify' | 'apple_music' | 'youtube', (query: string) => string> = {
  spotify: (query) => `https://open.spotify.com/search/${encodeURIComponent(query)}`,
  apple_music: (query) => `https://music.apple.com/search?term=${encodeURIComponent(query)}`,
  youtube: (query) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
}

function fixtureMbid(id: number): string {
  const hex = id.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

function song(input: FixtureInput): FixtureSong {
  const mbid = fixtureMbid(input.id)
  const query = `${input.artist} ${input.title}`
  const listenOn = input.listenOn ?? ['spotify', 'apple_music', 'youtube']
  const sources: Source[] = [
    ...listenOn.map((name) => ({
      name,
      external_id: toToken(query),
      url: LISTEN_URLS[name](query),
    })),
    {
      name: 'musicbrainz',
      external_id: mbid,
      url: `https://musicbrainz.org/search?type=recording&query=${encodeURIComponent(query)}`,
    },
  ].sort((a, b) => a.name.localeCompare(b.name))

  return {
    id: input.id,
    title: input.title,
    artist_credit: input.artist,
    duration_ms: input.durationMs,
    mbid,
    isrc: input.isrc ?? null,
    disambiguation: input.disambiguation ?? null,
    sources,
    tags: [
      { kind: 'artist', name: input.artist, appliedBy: MOCK_CATALOG_USER },
      ...input.genres.map((name) => ({
        kind: 'genre' as const,
        name,
        appliedBy: MOCK_CATALOG_USER,
      })),
      ...(input.community ?? []).map(([kind, name]) => ({
        kind,
        name,
        appliedBy: MOCK_COMMUNITY_USER,
      })),
    ],
  }
}

export const catalogFixtures: FixtureSong[] = [
  song({
    id: 1,
    title: 'Sampa',
    artist: 'Caetano Veloso',
    durationMs: 194000,
    genres: ['MPB', 'Tropicália'],
    community: [
      ['feeling', 'Warm'],
      ['feeling', 'Nostalgic'],
      ['instrument', 'Acoustic Guitar'],
    ],
  }),
  song({
    id: 2,
    title: 'Águas de Março',
    artist: 'Elis Regina',
    durationMs: 213000,
    genres: ['MPB', 'Bossa Nova'],
    community: [
      ['feeling', 'Sunny'],
      ['feeling', 'Carefree'],
      ['instrument', 'Acoustic Guitar'],
    ],
  }),
  song({
    id: 3,
    title: 'The Girl From Ipanema',
    artist: 'Antônio Carlos Jobim',
    durationMs: 324000,
    genres: ['Bossa Nova', 'Jazz', 'MPB'],
    community: [
      ['feeling', 'Sunny'],
      ['instrument', 'Saxophone'],
    ],
  }),
  song({
    id: 4,
    title: 'Mas Que Nada',
    artist: 'Jorge Ben Jor',
    durationMs: 179000,
    genres: ['Samba', 'MPB'],
    community: [
      ['feeling', 'Carefree'],
      ['instrument', 'Percussion'],
    ],
  }),
  song({
    id: 5,
    title: 'Baby',
    artist: 'Gal Costa',
    durationMs: 213000,
    genres: ['Tropicália', 'MPB'],
    community: [['feeling', 'Warm']],
  }),
  song({
    id: 6,
    title: 'So What',
    artist: 'Miles Davis',
    durationMs: 562000,
    genres: ['Jazz', 'Modal Jazz', 'Cool Jazz'],
    community: [
      ['feeling', 'Late Night'],
      ['feeling', 'Contemplative'],
      ['instrument', 'Trumpet'],
    ],
  }),
  song({
    id: 7,
    title: 'Giant Steps',
    artist: 'John Coltrane',
    durationMs: 286000,
    genres: ['Jazz', 'Hard Bop'],
    community: [['instrument', 'Saxophone']],
  }),
  song({
    id: 8,
    title: 'Summertime',
    artist: 'Ella Fitzgerald',
    durationMs: 298000,
    genres: ['Jazz', 'Vocal Jazz'],
    community: [
      ['feeling', 'Late Night'],
      ['feeling', 'Intimate'],
    ],
  }),
  song({
    id: 9,
    title: 'Lorelei',
    artist: 'Cocteau Twins',
    durationMs: 222000,
    genres: ['Dream Pop', 'Ethereal Wave'],
    community: [
      ['feeling', 'Dreamy'],
      ['feeling', 'Ethereal'],
    ],
  }),
  song({
    id: 10,
    title: 'Teardrop',
    artist: 'Massive Attack',
    durationMs: 330000,
    genres: ['Trip Hop', 'Electronic'],
    community: [
      ['feeling', 'Dreamy'],
      ['feeling', 'Late Night'],
    ],
  }),
  song({
    id: 11,
    title: 'Only Shallow',
    artist: 'My Bloody Valentine',
    durationMs: 257000,
    genres: ['Shoegaze', 'Dream Pop'],
    community: [['instrument', 'Electric Guitar']],
    listenOn: ['spotify', 'youtube'],
  }),
  song({
    id: 12,
    title: 'Hyperballad',
    artist: 'Björk',
    durationMs: 321000,
    genres: ['Electronic', 'Art Pop'],
    community: [['feeling', 'Dreamy']],
  }),
  song({
    id: 13,
    title: 'One More Time',
    artist: 'Daft Punk',
    durationMs: 320000,
    genres: ['Electronic', 'French House'],
    community: [
      ['feeling', 'Euphoric'],
      ['instrument', 'Synthesizer'],
    ],
  }),
  song({
    id: 14,
    title: 'I Feel Love',
    artist: 'Donna Summer',
    durationMs: 353000,
    genres: ['Disco', 'Electronic', 'Synth-pop'],
    community: [['instrument', 'Synthesizer']],
  }),
  song({
    id: 15,
    title: 'Superstition',
    artist: 'Stevie Wonder',
    durationMs: 245000,
    genres: ['Soul', 'Funk'],
    community: [
      ['feeling', 'Groovy'],
      ['instrument', 'Clavinet'],
    ],
  }),
  song({
    id: 16,
    title: "What's Going On",
    artist: 'Marvin Gaye',
    durationMs: 233000,
    genres: ['Soul'],
    community: [['feeling', 'Warm']],
  }),
  song({
    id: 17,
    title: 'Smooth Operator',
    artist: 'Sade',
    durationMs: 298000,
    genres: ['Soul', 'Sophisti-pop'],
    community: [
      ['feeling', 'Late Night'],
      ['instrument', 'Saxophone'],
    ],
  }),
  song({
    id: 18,
    title: 'Paranoid Android',
    artist: 'Radiohead',
    durationMs: 387000,
    genres: ['Rock', 'Art Rock'],
    community: [['instrument', 'Electric Guitar']],
  }),
  song({
    id: 19,
    title: 'Where Is My Mind?',
    artist: 'Pixies',
    durationMs: 229000,
    genres: ['Rock', 'Alternative Rock'],
    community: [['feeling', 'Nostalgic']],
    disambiguation: 'album version',
  }),
  song({
    id: 20,
    title: 'Bohemian Rhapsody',
    artist: 'Queen',
    durationMs: 355000,
    genres: ['Rock', 'Progressive Rock'],
    community: [['instrument', 'Piano']],
    isrc: 'GBUM71029604',
  }),
]
