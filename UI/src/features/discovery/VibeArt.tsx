import type { ReactElement } from 'react'
import type { Vibe } from '../../config/vibes'
import styles from './VibeArt.module.css'

const SHAPES: Record<string, ReactElement> = {
  dreamy: (
    <>
      <circle cx="30" cy="35" r="22" fill="var(--vibe-glow)" opacity="0.9" />
      <circle cx="68" cy="58" r="16" fill="var(--vibe-accent)" opacity="0.55" />
      <circle cx="45" cy="70" r="9" fill="#fff" opacity="0.6" />
    </>
  ),
  'late-night': (
    <>
      <circle
        cx="40"
        cy="54"
        r="18"
        fill="none"
        stroke="var(--vibe-accent)"
        strokeWidth="7"
        opacity="0.9"
      />
      <circle
        cx="68"
        cy="48"
        r="12"
        fill="none"
        stroke="var(--vibe-accent)"
        strokeWidth="5"
        opacity="0.65"
      />
      <circle cx="60" cy="74" r="8" fill="var(--vibe-glow)" opacity="0.9" />
    </>
  ),
  future: (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x={56 + index * 6}
          y={18 + (index % 3) * 6}
          width="3"
          height={48 - index * 4}
          fill="var(--vibe-accent)"
          opacity={0.25 + index * 0.1}
        />
      ))}
      <path d="M10 20l12 0-6 10z M26 32l10 0-5 8z" fill="var(--vibe-accent)" opacity="0.8" />
    </>
  ),
}

interface VibeArtProps {
  vibe: Vibe
}

export function VibeArt({ vibe }: VibeArtProps) {
  return (
    <svg
      className={styles.art}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {SHAPES[vibe.id] ?? <circle cx="60" cy="40" r="22" fill="var(--vibe-accent)" opacity="0.8" />}
      {Array.from({ length: 4 }, (_, index) => (
        <path
          key={index}
          d={`M-5 ${78 + index * 4} C 25 ${66 + index * 3}, 55 ${92 - index * 2}, 105 ${74 + index * 4}`}
          fill="none"
          stroke="var(--vibe-accent)"
          strokeWidth="0.8"
          opacity={0.35 + index * 0.12}
        />
      ))}
    </svg>
  )
}
