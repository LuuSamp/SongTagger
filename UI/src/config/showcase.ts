import type { ShowcaseSong } from '../domain/types'

/**
 * Landing hero fallback, used only when `GET /showcase` fails or the catalog has no tagged songs.
 * Ids double as artwork seeds. Tags are shown without links, since they may not exist in the catalog.
 */
export const fallbackShowcase: readonly ShowcaseSong[] = [
  {
    id: 59,
    title: 'Sampa',
    artist_credit: 'Caetano Veloso',
    image_url: null,
    tags: [
      { kind: 'feeling', name: 'warm', token: 'warm' },
      { kind: 'feeling', name: 'nostalgic', token: 'nostalgic' },
      { kind: 'instrument', name: 'acoustic guitar', token: 'acoustic-guitar' },
    ],
  },
  {
    id: 19,
    title: 'So What',
    artist_credit: 'Miles Davis',
    image_url: null,
    tags: [
      { kind: 'feeling', name: 'late night', token: 'late-night' },
      { kind: 'feeling', name: 'contemplative', token: 'contemplative' },
      { kind: 'instrument', name: 'trumpet', token: 'trumpet' },
    ],
  },
  {
    id: 44,
    title: 'Teardrop',
    artist_credit: 'Massive Attack',
    image_url: null,
    tags: [
      { kind: 'genre', name: 'trip hop', token: 'trip-hop' },
      { kind: 'feeling', name: 'dreamy', token: 'dreamy' },
    ],
  },
]
