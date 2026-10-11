import { useId, type CSSProperties } from 'react'
import type { SceneId } from '../../domain/scenes'
import styles from './Celestial.module.css'

const CENTER = 60

function polar(radius: number, degrees: number): readonly [number, number] {
  const angle = (degrees * Math.PI) / 180
  return [CENTER + Math.cos(angle) * radius, CENTER + Math.sin(angle) * radius]
}

function radial(count: number, inner: number, outer: number) {
  return Array.from({ length: count }, (_, index) => {
    const degrees = (index * 360) / count
    const [x1, y1] = polar(inner, degrees)
    const [x2, y2] = polar(outer, degrees)
    return { index, degrees, x1, y1, x2, y2 }
  })
}

function rayStyle(ray: { index: number; degrees: number; x1: number; y1: number }): CSSProperties {
  return {
    '--ray': ray.index,
    '--rhythm': ray.index % 3,
    '--ox': `${ray.x1}px`,
    '--oy': `${ray.y1}px`,
    '--angle': `${ray.degrees}deg`,
  } as CSSProperties
}

const SUN_RAYS = radial(12, 36, 48)
const NEON_BARS = radial(16, 29, 37)
const VINYL_TICKS = radial(12, 45, 51)

const STARS = [
  [34, 30, 3.2],
  [86, 26, 2.4],
  [92, 52, 3.6],
  [28, 62, 2.6],
  [40, 88, 3],
  [80, 90, 2.4],
  [62, 18, 2],
  [98, 74, 2.2],
  [22, 44, 1.8],
  [58, 98, 2],
] as const

const SUNBURST_RAYS = Array.from({ length: 16 }, (_, index) => {
  const degrees = (index * 360) / 16
  const points = [30, 37, 44, 51].map((radius, step) => {
    const sway = step === 0 || step === 3 ? 0 : step === 1 ? 5 : -5
    return polar(radius, degrees + sway)
  })
  const [a, b, c, d] = points as [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ]
  return {
    index,
    d: `M${a[0].toFixed(1)} ${a[1].toFixed(1)} C ${b[0].toFixed(1)} ${b[1].toFixed(1)}, ${c[0].toFixed(1)} ${c[1].toFixed(1)}, ${d[0].toFixed(1)} ${d[1].toFixed(1)}`,
  }
})

const HAZE_DOTS = Array.from({ length: 8 }, (_, index) => polar(34, index * 45 + 20))

function star(x: number, y: number, size: number): string {
  const inner = size * 0.28
  return [
    `M${x} ${y - size}`,
    `L${x + inner} ${y - inner}`,
    `L${x + size} ${y}`,
    `L${x + inner} ${y + inner}`,
    `L${x} ${y + size}`,
    `L${x - inner} ${y + inner}`,
    `L${x - size} ${y}`,
    `L${x - inner} ${y - inner}`,
    'Z',
  ].join(' ')
}

function Sun() {
  return (
    <g className={styles.spin} style={{ '--spin': '40s' } as CSSProperties}>
      <circle
        className={styles.core}
        cx="60"
        cy="60"
        r="26"
        fill="var(--scene-body)"
        opacity="0.8"
      />
      {SUN_RAYS.map((ray) => (
        <line
          key={ray.index}
          className={styles.ray}
          style={rayStyle(ray)}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke="var(--scene-detail)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.7"
        />
      ))}
    </g>
  )
}

function Moon() {
  const mask = `moon-${useId().replace(/:/g, '')}`
  return (
    <>
      <circle cx="60" cy="60" r="56" fill="var(--scene-sky)" />
      <g className={styles.spin} style={{ '--spin': '90s' } as CSSProperties}>
        {STARS.map(([x, y, size], index) => (
          <path
            key={index}
            className={styles.star}
            style={{ '--i': index, '--sx': `${x}px`, '--sy': `${y}px` } as CSSProperties}
            d={star(x, y, size)}
            fill="var(--scene-detail)"
          />
        ))}
      </g>
      <mask id={mask}>
        <rect width="120" height="120" fill="white" />
        <circle cx="70" cy="52" r="19" fill="black" />
      </mask>
      <g className={styles.moon}>
        <circle cx="60" cy="60" r="23" fill="var(--scene-body)" mask={`url(#${mask})`} />
      </g>
    </>
  )
}

function NeonRing() {
  return (
    <>
      <circle cx="60" cy="60" r="56" fill="var(--scene-sky)" />
      {NEON_BARS.map((bar) => (
        <line
          key={bar.index}
          className={styles.bar}
          style={rayStyle(bar)}
          x1={bar.x1}
          y1={bar.y1}
          x2={bar.x2}
          y2={bar.y2}
          stroke={bar.index % 2 === 0 ? 'var(--scene-body)' : 'var(--scene-detail)'}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      <g className={styles.ring}>
        <circle cx="60" cy="60" r="21" fill="none" stroke="var(--scene-body)" strokeWidth="3.2" />
        <circle cx="60" cy="60" r="13" fill="none" stroke="var(--scene-detail)" strokeWidth="1.6" />
      </g>
    </>
  )
}

function SmokeMoon() {
  return (
    <>
      <circle cx="60" cy="68" r="34" fill="var(--scene-glow)" opacity="0.18" />
      {[0, 1, 2].map((index) => (
        <ellipse
          key={index}
          className={styles.smoke}
          style={{ '--i': index } as CSSProperties}
          cx="60"
          cy={36 - index * 11}
          rx={13 + index * 3}
          ry={3.6 + index}
          fill="none"
          stroke="var(--scene-detail)"
          strokeWidth="1.6"
          opacity={0.75 - index * 0.2}
        />
      ))}
      <circle className={styles.core} cx="60" cy="68" r="22" fill="var(--scene-body)" />
    </>
  )
}

function Sunburst() {
  return (
    <g className={styles.spin} style={{ '--spin': '30s' } as CSSProperties}>
      <g className={styles.sway}>
        {SUNBURST_RAYS.map((ray) => (
          <path
            key={ray.index}
            d={ray.d}
            fill="none"
            stroke="var(--scene-detail)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        ))}
      </g>
      <circle className={styles.bounce} cx="60" cy="60" r="25" fill="var(--scene-body)" />
    </g>
  )
}

function Halo() {
  return (
    <>
      {[46, 38, 30].map((radius, index) => (
        <circle
          key={radius}
          className={styles.halo}
          style={{ '--i': index } as CSSProperties}
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="var(--scene-detail)"
          strokeWidth="1"
          opacity={0.25 + index * 0.15}
        />
      ))}
      <g className={styles.spin} style={{ '--spin': '24s' } as CSSProperties}>
        {HAZE_DOTS.map(([x, y], index) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={index % 2 === 0 ? 2.4 : 1.6}
            fill="var(--scene-detail)"
          />
        ))}
      </g>
      <circle className={styles.core} cx="60" cy="60" r="20" fill="var(--scene-body)" />
    </>
  )
}

function Vinyl() {
  return (
    <>
      {VINYL_TICKS.map((tick) => (
        <line
          key={tick.index}
          className={styles.tick}
          style={rayStyle(tick)}
          x1={tick.x1}
          y1={tick.y1}
          x2={tick.x2}
          y2={tick.y2}
          stroke="var(--scene-detail)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      <g className={styles.spin} style={{ '--spin': '1.8s' } as CSSProperties}>
        <circle cx="60" cy="60" r="40" fill="var(--scene-body)" />
        {[35, 30, 25, 20].map((radius) => (
          <circle
            key={radius}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgb(255 255 255 / 12%)"
            strokeWidth="0.8"
          />
        ))}
        <path
          d="M 32 44 A 32 32 0 0 1 52 29"
          fill="none"
          stroke="rgb(255 255 255 / 28%)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="60" cy="60" r="12" fill="var(--scene-detail)" />
        <circle cx="60" cy="60" r="2" fill="var(--color-canvas)" />
      </g>
    </>
  )
}

const BODIES: Record<SceneId, () => JSX.Element> = {
  daylight: Sun,
  nocturne: Moon,
  neon: NeonRing,
  lounge: SmokeMoon,
  tropical: Sunburst,
  haze: Halo,
  street: Vinyl,
}

export function Celestial({ scene, className }: { scene: SceneId; className?: string }) {
  const Body = BODIES[scene]
  return (
    <svg className={className} viewBox="0 0 120 120" data-body={scene}>
      <Body />
    </svg>
  )
}
