import type { CSSProperties } from 'react'
import type { Vibe } from '../../config/vibes'

export function vibeStyle(vibe: Vibe): CSSProperties {
  return {
    '--vibe-base': vibe.palette.base,
    '--vibe-glow': vibe.palette.glow,
    '--vibe-accent': vibe.palette.accent,
    '--vibe-ink': vibe.palette.ink,
  } as CSSProperties
}
