import type { SceneId } from '../../domain/scenes'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { FOLLOW_WAVE, LEAD_WAVE, waveFrames, wavePath } from './wavePath'

type Frames = ReadonlyArray<readonly [number, number]>

interface WaveMotion {
  lead: { duration: string; frames: Frames }
  follow: { duration: string; frames: Frames }
}

const MOTION: Record<SceneId, WaveMotion> = {
  daylight: {
    lead: {
      duration: '1.6s',
      frames: [
        [1, 0],
        [1.55, 0.9],
        [0.55, 2.1],
        [1.35, 3.4],
        [1, 0],
      ],
    },
    follow: {
      duration: '2.1s',
      frames: [
        [1, 0],
        [0.6, -1.4],
        [1.5, -2.6],
        [0.8, -3.8],
        [1, 0],
      ],
    },
  },
  nocturne: {
    lead: {
      duration: '1s',
      frames: [
        [1, 0],
        [1.95, 1.4],
        [0.35, 2.9],
        [1.8, 4.3],
        [1, 0],
      ],
    },
    follow: {
      duration: '1.3s',
      frames: [
        [1, 0],
        [0.4, -1.8],
        [1.85, -3.1],
        [0.6, -4.6],
        [1, 0],
      ],
    },
  },
  neon: {
    lead: {
      duration: '0.7s',
      frames: [
        [1, 0],
        [1.5, 1.6],
        [0.6, 3.2],
        [1.45, 4.8],
        [1, 0],
      ],
    },
    follow: {
      duration: '0.9s',
      frames: [
        [1, 0],
        [0.65, -1.6],
        [1.45, -3.2],
        [0.7, -4.8],
        [1, 0],
      ],
    },
  },
  lounge: {
    lead: {
      duration: '2.6s',
      frames: [
        [1, 0],
        [1.3, 0.6],
        [0.8, 1.3],
        [1.2, 1.9],
        [1, 0],
      ],
    },
    follow: {
      duration: '3.2s',
      frames: [
        [1, 0],
        [0.85, -0.6],
        [1.25, -1.2],
        [0.9, -1.9],
        [1, 0],
      ],
    },
  },
  tropical: {
    lead: {
      duration: '2.2s',
      frames: [
        [1, 0],
        [1.6, 1.2],
        [0.7, 2.5],
        [1.5, 3.7],
        [1, 0],
      ],
    },
    follow: {
      duration: '2.8s',
      frames: [
        [1, 0],
        [0.7, -1.2],
        [1.55, -2.5],
        [0.8, -3.7],
        [1, 0],
      ],
    },
  },
  haze: {
    lead: {
      duration: '3.4s',
      frames: [
        [1, 0],
        [1.2, 0.5],
        [0.85, 1],
        [1.15, 1.5],
        [1, 0],
      ],
    },
    follow: {
      duration: '4.2s',
      frames: [
        [1, 0],
        [0.9, -0.5],
        [1.15, -1],
        [0.9, -1.5],
        [1, 0],
      ],
    },
  },
  street: {
    lead: {
      duration: '0.9s',
      frames: [
        [1, 0],
        [1.8, 0.4],
        [0.5, 0.8],
        [1.6, 1.2],
        [1, 0],
      ],
    },
    follow: {
      duration: '1.1s',
      frames: [
        [1, 0],
        [0.5, -0.4],
        [1.7, -0.8],
        [0.6, -1.2],
        [1, 0],
      ],
    },
  },
}

const SPLINES = '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1'

interface PlaybackWaveProps {
  playing: boolean
  scene?: SceneId
  className?: string
}

export function PlaybackWave({ playing, scene = 'daylight', className }: PlaybackWaveProps) {
  const reduceMotion = useReducedMotion()
  const animate = playing && !reduceMotion
  const motion = MOTION[scene]

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
            key={scene}
            attributeName="d"
            dur={motion.lead.duration}
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={SPLINES}
            values={waveFrames(LEAD_WAVE, motion.lead.frames)}
          />
        ) : null}
      </path>
      <path d={wavePath(FOLLOW_WAVE)}>
        {animate ? (
          <animate
            key={scene}
            attributeName="d"
            dur={motion.follow.duration}
            repeatCount="indefinite"
            calcMode="spline"
            keySplines={SPLINES}
            values={waveFrames(FOLLOW_WAVE, motion.follow.frames)}
          />
        ) : null}
      </path>
    </svg>
  )
}
