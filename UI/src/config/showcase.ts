import type { Tag } from '../domain/types'

export interface ShowcaseSong {
  seed: number
  title: string
  artist: string
  tags: Tag[]
}

export const showcaseSongs: ShowcaseSong[] = [
  {
    seed: 59,
    title: 'Sampa',
    artist: 'Caetano Veloso',
    tags: [
      { kind: 'feeling', name: 'warm', token: 'warm' },
      { kind: 'feeling', name: 'nostalgic', token: 'nostalgic' },
      { kind: 'instrument', name: 'acoustic guitar', token: 'acoustic-guitar' },
    ],
  },
  {
    seed: 19,
    title: 'So What',
    artist: 'Miles Davis',
    tags: [
      { kind: 'feeling', name: 'late night', token: 'late-night' },
      { kind: 'feeling', name: 'contemplative', token: 'contemplative' },
      { kind: 'instrument', name: 'trumpet', token: 'trumpet' },
    ],
  },
  {
    seed: 44,
    title: 'Teardrop',
    artist: 'Massive Attack',
    tags: [
      { kind: 'genre', name: 'trip hop', token: 'trip-hop' },
      { kind: 'feeling', name: 'dreamy', token: 'dreamy' },
    ],
  },
]
