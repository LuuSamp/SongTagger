import { describe, expect, it } from 'vitest'
import { FOLLOW_WAVE, LEAD_WAVE, waveFrames, wavePath } from './wavePath'

function commands(path: string): string {
  return path.replace(/[-\d.,\s]+/g, '')
}

describe('wavePath', () => {
  it('reproduces the resting divider exactly', () => {
    expect(wavePath(LEAD_WAVE)).toBe(
      'M0 22 C 40 6, 70 36, 110 20 S 180 6, 220 22 S 300 38, 340 18 S 390 12, 400 20',
    )
    expect(wavePath(FOLLOW_WAVE)).toBe(
      'M0 26 C 50 14, 80 34, 120 24 S 190 12, 230 26 S 310 34, 350 22 S 392 18, 400 24',
    )
  })

  it('keeps the same command structure so shapes can morph', () => {
    const base = commands(wavePath(LEAD_WAVE))
    expect(commands(wavePath(LEAD_WAVE, 1.6, 1.2))).toBe(base)
    expect(commands(wavePath(LEAD_WAVE, 0.4, -2))).toBe(base)
  })

  it('scales the distance from the baseline with the amplitude', () => {
    const loud = wavePath(LEAD_WAVE, 2)
    expect(loud.startsWith('M0 23 C 40 -9, 70 51')).toBe(true)
    expect(
      waveFrames(LEAD_WAVE, [
        [1, 0],
        [1.5, 1],
      ]).split(';'),
    ).toHaveLength(2)
  })
})
