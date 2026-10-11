import type { Tag } from './types'

export const SCENE_IDS = [
  'daylight',
  'nocturne',
  'neon',
  'lounge',
  'tropical',
  'haze',
  'street',
] as const

export type SceneId = (typeof SCENE_IDS)[number]

export interface SceneInfo {
  id: SceneId
  label: string
}

export const SCENES: Record<SceneId, SceneInfo> = {
  daylight: { id: 'daylight', label: 'Daylight' },
  nocturne: { id: 'nocturne', label: 'Night' },
  neon: { id: 'neon', label: 'Neon' },
  lounge: { id: 'lounge', label: 'Lounge' },
  tropical: { id: 'tropical', label: 'Tropical' },
  haze: { id: 'haze', label: 'Haze' },
  street: { id: 'street', label: 'Street' },
}

export interface SceneChoice {
  scene: SceneId
  reason: Tag | null
}

const EXACT_GENRES: Record<string, SceneId> = {
  'pop rock': 'daylight',
  'soft rock': 'daylight',
  'folk rock': 'daylight',
  'country rock': 'daylight',
  'piano rock': 'daylight',
  aor: 'daylight',
  'sophisti-pop': 'daylight',
  'baroque pop': 'daylight',
  'chamber pop': 'daylight',
  'jangle pop': 'daylight',
  'dream pop': 'haze',
  'noise pop': 'haze',
  'ambient pop': 'haze',
  'psychedelic pop': 'haze',
  'neo-psychedelia': 'haze',
  'post-minimalism': 'haze',
  experimental: 'haze',
  'jazz rap': 'street',
  'rap rock': 'street',
  'trip hop': 'lounge',
  downtempo: 'lounge',
  'quiet storm': 'lounge',
  'latin jazz': 'tropical',
  'samba-jazz': 'tropical',
  'new wave': 'neon',
  'dance-punk': 'neon',
  'alternative dance': 'neon',
  leftfield: 'neon',
  glam: 'nocturne',
}

const KEYWORDS: ReadonlyArray<readonly [SceneId, readonly string[]]> = [
  ['street', ['hip hop', 'rap', 'trap', 'grime', 'boom bap', 'drill']],
  [
    'haze',
    [
      'ambient',
      'shoegaze',
      'dream',
      'chillout',
      'classical',
      'instrumental',
      'ethereal',
      'new age',
    ],
  ],
  [
    'neon',
    [
      'electro',
      'house',
      'techno',
      'trance',
      'disco',
      'dance',
      'synth',
      'club',
      'big beat',
      'idm',
      'edm',
      'dubstep',
      'drum and bass',
      'europop',
    ],
  ],
  [
    'lounge',
    [
      'jazz',
      'soul',
      'r&b',
      'blues',
      'funk',
      'motown',
      'gospel',
      'swing',
      'big band',
      'lounge',
      'dixieland',
      'doo-wop',
    ],
  ],
  [
    'tropical',
    [
      'latin',
      'bossa',
      'mpb',
      'samba',
      'salsa',
      'reggae',
      'dub',
      'afrobeat',
      'flamenco',
      'cumbia',
      'tropic',
      'forró',
      'axé',
    ],
  ],
  [
    'nocturne',
    [
      'rock',
      'punk',
      'metal',
      'grunge',
      'goth',
      'noise',
      'garage',
      'stoner',
      'kraut',
      'hardcore',
      'emo',
      'industrial',
      'britpop',
    ],
  ],
]

const FEELINGS: Record<string, SceneId> = {
  'late night': 'lounge',
  intimate: 'lounge',
  smoky: 'lounge',
  dreamy: 'haze',
  ethereal: 'haze',
  contemplative: 'haze',
  sunny: 'tropical',
  carefree: 'tropical',
  euphoric: 'neon',
  energetic: 'neon',
  dark: 'nocturne',
  melancholic: 'nocturne',
  angry: 'nocturne',
}

function normalized(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function sceneForGenre(name: string): SceneId {
  const genre = normalized(name)
  const exact = EXACT_GENRES[genre]
  if (exact) {
    return exact
  }
  for (const [scene, keywords] of KEYWORDS) {
    if (keywords.some((keyword) => genre.includes(keyword))) {
      return scene
    }
  }
  return 'daylight'
}

export function sceneForSong(tags: readonly Tag[]): SceneChoice {
  const genres = tags.filter((tag) => tag.kind === 'genre')
  const counts = new Map<SceneId, { count: number; first: number; tag: Tag }>()
  genres.forEach((tag, index) => {
    const scene = sceneForGenre(tag.name)
    if (scene === 'daylight') {
      return
    }
    const entry = counts.get(scene)
    if (entry) {
      entry.count += 1
    } else {
      counts.set(scene, { count: 1, first: index, tag })
    }
  })
  let best: { scene: SceneId; count: number; first: number; tag: Tag } | null = null
  for (const [scene, entry] of counts) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && entry.first < best.first)
    ) {
      best = { scene, ...entry }
    }
  }
  if (best) {
    return { scene: best.scene, reason: best.tag }
  }
  const feeling = tags.find((tag) => tag.kind === 'feeling' && FEELINGS[normalized(tag.name)])
  if (feeling) {
    return { scene: FEELINGS[normalized(feeling.name)] ?? 'daylight', reason: feeling }
  }
  return { scene: 'daylight', reason: genres[0] ?? null }
}
