import type { CSSProperties } from 'react'
import type { SceneId } from '../../domain/scenes'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { Celestial } from './Celestial'
import styles from './OrganicBackdrop.module.css'

const SPLINES = '0.45 0 0.55 1;0.45 0 0.55 1'

const SHAPES = {
  sand: {
    rest: 'M260 0C330 120 190 210 250 340C310 470 400 470 400 470V0Z',
    swell: 'M238 0C345 135 168 225 240 352C318 486 400 452 400 452V0Z',
    duration: '6s',
  },
  ember: {
    rest: 'M400 380C300 420 250 520 300 640C350 760 280 840 330 900H400Z',
    swell: 'M400 362C282 418 268 538 286 652C338 772 300 828 322 900H400Z',
    duration: '7s',
  },
  edge: {
    rest: 'M0 40C90 70 120 160 70 230C30 290 60 360 0 400Z',
    swell: 'M0 28C108 78 112 178 84 238C42 304 52 352 0 400Z',
    duration: '5s',
  },
} as const

interface OrganicBackdropProps {
  playing?: boolean
  scene?: SceneId
}

function Breath({ shape }: { shape: (typeof SHAPES)[keyof typeof SHAPES] }) {
  return (
    <animate
      attributeName="d"
      dur={shape.duration}
      repeatCount="indefinite"
      calcMode="spline"
      keySplines={SPLINES}
      values={`${shape.rest};${shape.swell};${shape.rest}`}
    />
  )
}

export function OrganicBackdrop({ playing = false, scene = 'daylight' }: OrganicBackdropProps) {
  const reduceMotion = useReducedMotion()
  const breathe = playing && !reduceMotion

  return (
    <div
      className={styles.backdrop}
      aria-hidden="true"
      data-scene={scene}
      data-playing={playing || undefined}
    >
      <svg className={styles.right} viewBox="0 0 400 900" preserveAspectRatio="none">
        <path
          className={styles.shape}
          style={{ '--rest': 0.55 } as CSSProperties}
          d={SHAPES.sand.rest}
          fill="var(--scene-blob-a)"
          opacity="0.55"
        >
          {breathe ? <Breath shape={SHAPES.sand} /> : null}
        </path>
        <path
          className={styles.shape}
          style={{ '--rest': 0.35, '--shape-delay': '-3s' } as CSSProperties}
          d={SHAPES.ember.rest}
          fill="var(--scene-blob-b)"
          opacity="0.35"
        >
          {breathe ? <Breath shape={SHAPES.ember} /> : null}
        </path>
      </svg>
      <Celestial scene={scene} className={styles.sun} />
      <svg className={styles.left} viewBox="0 0 200 400" preserveAspectRatio="none">
        <path
          className={styles.shape}
          style={{ '--rest': 0.28, '--shape-delay': '-1.5s' } as CSSProperties}
          d={SHAPES.edge.rest}
          fill="var(--scene-blob-c)"
          opacity="0.28"
        >
          {breathe ? <Breath shape={SHAPES.edge} /> : null}
        </path>
      </svg>
    </div>
  )
}
