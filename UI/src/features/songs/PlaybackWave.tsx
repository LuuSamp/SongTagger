import { useReducedMotion } from '../../hooks/useReducedMotion'
import { FOLLOW_WAVE, LEAD_WAVE, waveFrames, wavePath } from './wavePath'

const LEAD_FRAMES = [
  [1, 0],
  [1.55, 0.9],
  [0.55, 2.1],
  [1.35, 3.4],
  [1, 0],
] as const

const FOLLOW_FRAMES = [
  [1, 0],
  [0.6, -1.4],
  [1.5, -2.6],
  [0.8, -3.8],
  [1, 0],
] as const

const SPLINES = '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1'

interface PlaybackWaveProps {
  playing: boolean
  className?: string
}

export function PlaybackWave({ playing, className }: PlaybackWaveProps) {
  const reduceMotion = useReducedMotion()
  const animate = playing && !reduceMotion

  return (
    <svg
      className={className}
      data-playing={playing || undefined}
      viewBox="0 0 400 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={wavePath(LEAD_WAVE)}>
        {animate ? (
          <animate
            attributeName="d"
            dur="1.6s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={SPLINES}
            values={waveFrames(LEAD_WAVE, LEAD_FRAMES)}
          />
        ) : null}
      </path>
      <path d={wavePath(FOLLOW_WAVE)}>
        {animate ? (
          <animate
            attributeName="d"
            dur="2.1s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={SPLINES}
            values={waveFrames(FOLLOW_WAVE, FOLLOW_FRAMES)}
          />
        ) : null}
      </path>
    </svg>
  )
}
