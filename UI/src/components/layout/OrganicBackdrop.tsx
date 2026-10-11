import type { CSSProperties } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
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

const RAYS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * Math.PI) / 6
  return {
    index,
    degrees: index * 30,
    x1: 60 + Math.cos(angle) * 36,
    y1: 60 + Math.sin(angle) * 36,
    x2: 60 + Math.cos(angle) * 48,
    y2: 60 + Math.sin(angle) * 48,
  }
})

interface OrganicBackdropProps {
  playing?: boolean
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

export function OrganicBackdrop({ playing = false }: OrganicBackdropProps) {
  const reduceMotion = useReducedMotion()
  const breathe = playing && !reduceMotion

  return (
    <div className={styles.backdrop} aria-hidden="true" data-playing={playing || undefined}>
      <svg className={styles.right} viewBox="0 0 400 900" preserveAspectRatio="none">
        <path
          className={styles.shape}
          style={{ '--rest': 0.55 } as CSSProperties}
          d={SHAPES.sand.rest}
          fill="var(--color-sand)"
          opacity="0.55"
        >
          {breathe ? <Breath shape={SHAPES.sand} /> : null}
        </path>
        <path
          className={styles.shape}
          style={{ '--rest': 0.35, '--shape-delay': '-3s' } as CSSProperties}
          d={SHAPES.ember.rest}
          fill="var(--color-accent)"
          opacity="0.35"
        >
          {breathe ? <Breath shape={SHAPES.ember} /> : null}
        </path>
      </svg>
      <svg className={styles.sun} viewBox="0 0 120 120">
        <g className={styles.sunSpin}>
          <circle
            className={styles.core}
            cx="60"
            cy="60"
            r="26"
            fill="var(--color-sun)"
            opacity="0.8"
          />
          {RAYS.map((ray) => (
            <line
              key={ray.index}
              className={styles.ray}
              style={
                {
                  '--ray': ray.index,
                  '--rhythm': ray.index % 3,
                  '--ox': `${ray.x1}px`,
                  '--oy': `${ray.y1}px`,
                  '--angle': `${ray.degrees}deg`,
                } as CSSProperties
              }
              x1={ray.x1}
              y1={ray.y1}
              x2={ray.x2}
              y2={ray.y2}
              stroke="var(--color-sun)"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.7"
            />
          ))}
        </g>
      </svg>
      <svg className={styles.left} viewBox="0 0 200 400" preserveAspectRatio="none">
        <path
          className={styles.shape}
          style={{ '--rest': 0.28, '--shape-delay': '-1.5s' } as CSSProperties}
          d={SHAPES.edge.rest}
          fill="var(--color-accent)"
          opacity="0.28"
        >
          {breathe ? <Breath shape={SHAPES.edge} /> : null}
        </path>
      </svg>
    </div>
  )
}
