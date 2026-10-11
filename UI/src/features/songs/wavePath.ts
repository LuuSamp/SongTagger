export type WavePoint = readonly [number, number]

export interface WaveShape {
  baseline: number
  points: readonly WavePoint[]
}

export const LEAD_WAVE: WaveShape = {
  baseline: 21,
  points: [
    [0, 22],
    [40, 6],
    [70, 36],
    [110, 20],
    [180, 6],
    [220, 22],
    [300, 38],
    [340, 18],
    [390, 12],
    [400, 20],
  ],
}

export const FOLLOW_WAVE: WaveShape = {
  baseline: 25,
  points: [
    [0, 26],
    [50, 14],
    [80, 34],
    [120, 24],
    [190, 12],
    [230, 26],
    [310, 34],
    [350, 22],
    [392, 18],
    [400, 24],
  ],
}

const WOBBLE = 5
const WIDTH = 400

function format(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function wavePath(shape: WaveShape, amplitude = 1, phase = 0): string {
  const points = shape.points.map(([x, y]) => {
    const wobble = phase === 0 ? 0 : WOBBLE * Math.sin((x / WIDTH) * Math.PI * 3 + phase)
    return [x, shape.baseline + (y - shape.baseline) * amplitude + wobble] as const
  })
  const pair = (index: number) => {
    const point = points[index]
    return point ? `${format(point[0])} ${format(point[1])}` : '0 0'
  }
  return [
    `M${pair(0)}`,
    `C ${pair(1)}, ${pair(2)}, ${pair(3)}`,
    `S ${pair(4)}, ${pair(5)}`,
    `S ${pair(6)}, ${pair(7)}`,
    `S ${pair(8)}, ${pair(9)}`,
  ].join(' ')
}

export function waveFrames(
  shape: WaveShape,
  frames: ReadonlyArray<readonly [number, number]>,
): string {
  return frames.map(([amplitude, phase]) => wavePath(shape, amplitude, phase)).join(';')
}
