export const SWAY_PERIOD = 7
export const BASE_WIND = 26
export const GUST_STRENGTH = 0.35
export const GRAVITY = 10
export const MAX_TILT = (35 * Math.PI) / 180
export const MAX_NOTES = 5
export const MAX_NOTES_COMPACT = 3
export const MAX_STREAKS = 4
export const STREAK_TRAIL = 18
export const EDGE_FADE = 60
export const EDDY_TIME = 1.5
export const HOME_PULL = 0.06
export const BAND_PULL = 4

export type Random = () => number

export interface Bounds {
  width: number
  height: number
}

export interface Vector {
  x: number
  y: number
}

export type NoteGlyph = 'eighth' | 'beamed'

export interface Note {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  spin: number
  size: number
  drag: number
  phase: number
  glyph: NoteGlyph
  tone: number
  gain: number
  timeOffset: number
  turbulence: number
  eddyX: number
  eddyY: number
  homeY: number
}

export interface Band {
  top: number
  bottom: number
}

export interface Streak {
  x: number
  y: number
  age: number
  life: number
  trail: Vector[]
}

export function windAt(x: number, y: number, t: number): Vector {
  const gust = 1 + GUST_STRENGTH * Math.sin((2 * Math.PI * t) / SWAY_PERIOD + x * 0.003)
  return {
    x: BASE_WIND * gust,
    y: 7 * Math.sin(t * 0.45 + x * 0.008) + 4 * Math.sin(t * 0.9 + y * 0.02 + 1.3),
  }
}

export function noteBand(bounds: Bounds): Band {
  return { top: bounds.height * 0.36, bottom: bounds.height * 0.66 }
}

function gaussian(random: Random): number {
  const u = Math.max(random(), 1e-9)
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function eddy(value: number, turbulence: number, dt: number, random: Random): number {
  const decay = value * (dt / EDDY_TIME)
  const kick = turbulence * Math.sqrt((2 * dt) / EDDY_TIME) * gaussian(random)
  return value - decay + kick
}

export function stepNote(note: Note, t: number, dt: number, random: Random, band?: Band): Note {
  const eddyX = eddy(note.eddyX, note.turbulence, dt, random)
  const eddyY = eddy(note.eddyY, note.turbulence, dt, random)
  const wind = windAt(note.x, note.y, t + note.timeOffset)
  const windX = wind.x * note.gain + eddyX
  const windY = wind.y + eddyY

  const flutter = 6 * Math.sin(t * 1.6 + note.phase) * Math.cos(note.angle)
  const cruise = BASE_WIND * note.gain
  const lift = GRAVITY * Math.min(1.3, Math.abs(note.vx) / cruise)
  let restore = (note.homeY - note.y) * HOME_PULL
  if (band) {
    if (note.y < band.top) {
      restore += (band.top - note.y) * BAND_PULL
    } else if (note.y > band.bottom) {
      restore -= (note.y - band.bottom) * BAND_PULL
    }
  }

  const ax = (windX - note.vx) * note.drag
  const ay = (windY - note.vy) * note.drag + GRAVITY - lift - flutter + restore

  const vx = note.vx + ax * dt
  const vy = note.vy + ay * dt

  const torque = (windY - vy) * 0.04 + 0.9 * Math.sin(t * 1.7 + note.phase) - note.angle * 1.2
  let spin = note.spin + (torque - note.spin * 1.6) * dt
  let angle = note.angle + spin * dt
  if (Math.abs(angle) > MAX_TILT) {
    angle = Math.sign(angle) * MAX_TILT
    spin *= -0.3
  }

  return {
    ...note,
    x: note.x + vx * dt,
    y: note.y + vy * dt,
    vx,
    vy,
    angle,
    spin,
    eddyX,
    eddyY,
  }
}

export function noteOpacity(note: Note, bounds: Bounds): number {
  const fadeIn = Math.min(1, Math.max(0, (note.x + 20) / EDGE_FADE))
  const fadeOut = Math.min(1, Math.max(0, (bounds.width + 20 - note.x) / EDGE_FADE))
  return Math.min(fadeIn, fadeOut)
}

export function noteIsGone(note: Note, bounds: Bounds): boolean {
  return note.x > bounds.width + 40 || note.y > bounds.height + 40 || note.y < -60
}

export function laneY(random: Random, bounds: Bounds): number {
  const lane = random()
  const offset = random()
  if (lane < 0.45) {
    return bounds.height * (0.03 + offset * 0.12)
  }
  if (lane < 0.85) {
    return bounds.height * (0.8 + offset * 0.14)
  }
  return bounds.height * (0.25 + offset * 0.45)
}

export function spawnNote(random: Random, bounds: Bounds, anywhere = false): Note {
  const band = noteBand(bounds)
  const homeY = band.top + random() * (band.bottom - band.top)
  const gain = 0.6 + random() * 0.7
  return {
    x: anywhere ? random() * bounds.width : -30 - random() * 140,
    y: homeY,
    vx: BASE_WIND * gain * (0.7 + random() * 0.6),
    vy: (random() - 0.5) * 6,
    angle: (random() - 0.5) * 0.5,
    spin: 0,
    size: 12 + random() * 8,
    drag: 0.6 + random() * 0.5,
    phase: random() * Math.PI * 2,
    glyph: random() < 0.65 ? 'eighth' : 'beamed',
    tone: Math.floor(random() * 3),
    gain,
    timeOffset: random() * 30,
    turbulence: 8 + random() * 12,
    eddyX: 0,
    eddyY: 0,
    homeY,
  }
}

export function stepStreak(streak: Streak, t: number, dt: number): Streak {
  const wind = windAt(streak.x, streak.y, t)
  const x = streak.x + wind.x * 1.6 * dt
  const y = streak.y + wind.y * 1.2 * dt
  const trail = [...streak.trail, { x, y }].slice(-STREAK_TRAIL)
  return { ...streak, x, y, age: streak.age + dt, trail }
}

export function streakOpacity(streak: Streak): number {
  const progress = Math.min(1, Math.max(0, streak.age / streak.life))
  return Math.sin(Math.PI * progress)
}

export function spawnStreak(random: Random, bounds: Bounds): Streak {
  const x = random() * bounds.width * 0.7 - 40
  const y = laneY(random, bounds)
  return { x, y, age: 0, life: 3 + random() * 2, trail: [{ x, y }] }
}
