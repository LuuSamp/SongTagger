export interface VibePalette {
  base: string
  glow: string
  accent: string
  ink: string
}

export interface Vibe {
  id: string
  title: string
  description: string
  query: string
  relatedTags: string[]
  palette: VibePalette
}

export const featuredVibes: Vibe[] = [
  {
    id: 'dreamy',
    title: 'Dreamy & Atmospheric',
    description: 'Hazy guitars and floating voices.',
    query: 'dream-pop',
    relatedTags: ['dream-pop', 'trip-hop', 'shoegaze'],
    palette: { base: '#d9d3f2', glow: '#f6f0ff', accent: '#9fe3d4', ink: '#2f2a4a' },
  },
  {
    id: 'late-night',
    title: 'Late-Night Jazz',
    description: 'Smoky rooms, modal turns, slow burn.',
    query: 'jazz',
    relatedTags: ['jazz', 'vocal-jazz', 'late-night'],
    palette: { base: '#1f2340', glow: '#3a3f6b', accent: '#d7a64a', ink: '#f6ecd9' },
  },
  {
    id: 'future',
    title: 'Electronic Futures',
    description: 'Pulses, synths and forward motion.',
    query: 'electronic',
    relatedTags: ['electronic', 'house', 'french-house'],
    palette: { base: '#0f1a33', glow: '#123a5a', accent: '#7ff0e0', ink: '#e8fbff' },
  },
]

export const moreVibes: Vibe[] = [
  {
    id: 'brazil',
    title: 'Sun-soaked Brazil',
    description: 'MPB, bossa nova and samba.',
    query: 'mpb',
    relatedTags: ['mpb', 'bossa-nova', 'samba'],
    palette: { base: '#f0c9a4', glow: '#fbe7c8', accent: '#c46a4e', ink: '#3a2418' },
  },
  {
    id: 'soul',
    title: 'Soul & Groove',
    description: 'Warm voices over deep pockets.',
    query: 'soul',
    relatedTags: ['soul', 'funk', 'neo-soul'],
    palette: { base: '#6b3a2a', glow: '#a2563a', accent: '#f0c27b', ink: '#fbefe2' },
  },
  {
    id: 'guitars',
    title: 'Guitars Up',
    description: 'From art rock to alternative.',
    query: 'rock',
    relatedTags: ['rock', 'art-rock', 'alternative-rock'],
    palette: { base: '#2e3a2c', glow: '#4f6146', accent: '#e9c9a3', ink: '#f3efe4' },
  },
]
