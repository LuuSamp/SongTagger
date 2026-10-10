import { describe, expect, it } from 'vitest'
import {
  MAX_TILT,
  SWAY_PERIOD,
  noteBand,
  spawnNote,
  spawnStreak,
  stepNote,
  stepStreak,
  streakOpacity,
  windAt,
  type Note,
  type Random,
} from './windField'

function seeded(seed: number): Random {
  let state = seed
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

const bounds = { width: 700, height: 600 }
const band = noteBand(bounds)

function simulate(note: Note, seconds: number, random: Random) {
  const dt = 1 / 60
  let current = note
  let maxSpeed = 0
  let maxTilt = 0
  let minY = Infinity
  let maxY = -Infinity
  for (let step = 0; step < seconds * 60; step += 1) {
    current = stepNote(current, step * dt, dt, random, band)
    maxSpeed = Math.max(maxSpeed, Math.hypot(current.vx, current.vy))
    maxTilt = Math.max(maxTilt, Math.abs(current.angle))
    minY = Math.min(minY, current.y)
    maxY = Math.max(maxY, current.y)
  }
  return { current, maxSpeed, maxTilt, minY, maxY }
}

describe('wind field', () => {
  it('blows left to right and gusts with the tag sway period', () => {
    expect(windAt(100, 100, 0).x).toBeGreaterThan(0)
    expect(windAt(100, 100, 1.3).x).toBeCloseTo(windAt(100, 100, 1.3 + SWAY_PERIOD).x, 5)
  })
})

describe('note physics', () => {
  it('drifts rightward with bounded speed and tilt', () => {
    const random = seeded(7)
    for (let index = 0; index < 20; index += 1) {
      const note = spawnNote(random, bounds)
      const { current, maxSpeed, maxTilt } = simulate(note, 20, random)
      expect(current.x - note.x).toBeGreaterThan(150)
      expect(maxSpeed).toBeLessThan(90)
      expect(maxTilt).toBeLessThanOrEqual(MAX_TILT + 1e-9)
    }
  })

  it('stays inside the cards middle band', () => {
    const random = seeded(42)
    for (let index = 0; index < 20; index += 1) {
      const note = spawnNote(random, bounds)
      expect(note.y).toBeGreaterThanOrEqual(band.top)
      expect(note.y).toBeLessThanOrEqual(band.bottom)
      const { minY, maxY } = simulate(note, 20, random)
      expect(minY).toBeGreaterThan(band.top - 24)
      expect(maxY).toBeLessThan(band.bottom + 24)
    }
  })

  it('disperses notes instead of moving them in lockstep', () => {
    const spread: number[] = []
    for (let pair = 1; pair <= 12; pair += 1) {
      const twin = spawnNote(seeded(pair * 13), bounds)
      const first = simulate(twin, 10, seeded(pair * 101)).current
      const second = simulate(twin, 10, seeded(pair * 977)).current
      spread.push(Math.abs(first.y - second.y))
    }
    const meanSpread = spread.reduce((sum, value) => sum + value, 0) / spread.length
    expect(meanSpread).toBeGreaterThan(15)

    const note = spawnNote(seeded(5), bounds)

    const slow = simulate({ ...note, gain: 0.6, timeOffset: 0 }, 10, seeded(3)).current
    const fast = simulate({ ...note, gain: 1.3, timeOffset: 12 }, 10, seeded(3)).current
    expect(Math.abs(fast.x - slow.x)).toBeGreaterThan(40)
  })
})

describe('wind streaks', () => {
  it('keep a bounded trail and fade in and out over their life', () => {
    let streak = spawnStreak(seeded(3), bounds)
    for (let step = 0; step < 120; step += 1) {
      streak = stepStreak(streak, step / 60, 1 / 60)
    }
    expect(streak.trail.length).toBeLessThanOrEqual(18)
    expect(streakOpacity({ ...streak, age: 0 })).toBeCloseTo(0)
    expect(streakOpacity({ ...streak, age: streak.life / 2 })).toBeCloseTo(1)
  })
})
