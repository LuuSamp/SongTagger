import { useEffect, useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import {
  MAX_NOTES,
  MAX_NOTES_COMPACT,
  MAX_STREAKS,
  noteBand,
  noteIsGone,
  noteOpacity,
  spawnNote,
  spawnStreak,
  stepNote,
  stepStreak,
  streakOpacity,
  type Bounds,
  type Note,
  type Streak,
} from './windField'
import styles from './WindLayer.module.css'

const COMPACT_WIDTH = 640
const NOTE_ALPHA = [0.42, 0.38, 0.32]
const STREAK_ALPHA = 0.12
const MAX_DT = 1 / 30

function readColors(element: Element) {
  const styles = getComputedStyle(element)
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    notes: [
      read('--color-accent', '#c46a4e'),
      read('--color-sage', '#7f9273'),
      read('--color-ink-muted', '#6f645b'),
    ],
    streak: read('--color-ink-subtle', '#9a8e83'),
  }
}

function drawNote(context: CanvasRenderingContext2D, note: Note) {
  const scale = note.size / 20
  context.save()
  context.translate(note.x, note.y)
  context.rotate(note.angle)
  context.scale(scale, scale)
  context.translate(-10, -10)
  context.lineWidth = 1.7
  context.lineCap = 'round'

  const head = (cx: number, cy: number) => {
    context.beginPath()
    context.ellipse(cx, cy, 4.6, 3.4, -0.35, 0, Math.PI * 2)
    context.fill()
  }

  if (note.glyph === 'eighth') {
    head(6, 16)
    context.beginPath()
    context.moveTo(10.3, 15)
    context.lineTo(10.3, 2)
    context.bezierCurveTo(15.5, 4.5, 17, 8.5, 14, 12.5)
    context.stroke()
  } else {
    head(3.5, 17)
    head(14.5, 15)
    context.beginPath()
    context.moveTo(7.8, 16)
    context.lineTo(7.8, 3.2)
    context.moveTo(18.8, 14)
    context.lineTo(18.8, 1.2)
    context.stroke()
    context.beginPath()
    context.moveTo(7.8, 3.2)
    context.lineTo(18.8, 1.2)
    context.lineTo(18.8, 4.2)
    context.lineTo(7.8, 6.2)
    context.closePath()
    context.fill()
  }
  context.restore()
}

function drawStreak(context: CanvasRenderingContext2D, streak: Streak, color: string) {
  const envelope = streakOpacity(streak) * STREAK_ALPHA
  const { trail } = streak
  context.strokeStyle = color
  context.lineWidth = 1
  context.lineCap = 'round'
  for (let index = 1; index < trail.length; index += 1) {
    const from = trail[index - 1]
    const to = trail[index]
    if (!from || !to) {
      continue
    }
    context.globalAlpha = envelope * (index / trail.length)
    context.beginPath()
    context.moveTo(from.x, from.y)
    context.lineTo(to.x, to.y)
    context.stroke()
  }
  context.globalAlpha = 1
}

export function WindLayer() {
  const reduceMotion = useReducedMotion()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (reduceMotion || !canvas || !context) {
      return
    }

    const colors = readColors(canvas)
    const bounds: Bounds = { width: 0, height: 0 }
    let notes: Note[] = []
    let streaks: Streak[] = []
    let frame: number | null = null
    let last = 0
    let elapsed = 0
    let nextNoteAt = 0
    let nextStreakAt = 0
    let frames = 0
    let visible = true
    let seeded = false

    const maxNotes = () => (bounds.width < COMPACT_WIDTH ? MAX_NOTES_COMPACT : MAX_NOTES)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      bounds.width = rect.width
      bounds.height = rect.height
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (!seeded && rect.width > 0) {
        seeded = true
        notes = Array.from({ length: Math.max(1, maxNotes() - 1) }, () =>
          spawnNote(Math.random, bounds, true),
        )
      }
    }

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, MAX_DT) : 0
      last = now
      elapsed += dt

      if (elapsed >= nextNoteAt && notes.length < maxNotes()) {
        notes.push(spawnNote(Math.random, bounds))
        nextNoteAt = elapsed + 2 + Math.random() * 7
      }
      if (elapsed >= nextStreakAt && streaks.length < MAX_STREAKS) {
        streaks.push(spawnStreak(Math.random, bounds))
        nextStreakAt = elapsed + 1.2 + Math.random() * 1.8
      }

      notes = notes
        .map((note) => stepNote(note, elapsed, dt, Math.random, noteBand(bounds)))
        .filter((note) => !noteIsGone(note, bounds))
      streaks = streaks
        .map((streak) => stepStreak(streak, elapsed, dt))
        .filter((streak) => streak.age < streak.life)

      context.clearRect(0, 0, bounds.width, bounds.height)
      for (const streak of streaks) {
        drawStreak(context, streak, colors.streak)
      }
      for (const note of notes) {
        const color = colors.notes[note.tone] ?? colors.notes[0] ?? '#c46a4e'
        context.fillStyle = color
        context.strokeStyle = color
        context.globalAlpha = (NOTE_ALPHA[note.tone] ?? 0.24) * noteOpacity(note, bounds)
        drawNote(context, note)
      }
      context.globalAlpha = 1

      frames += 1
      if (frames % 30 === 0) {
        canvas.dataset.frames = String(frames)
      }
      frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (frame === null && visible && !document.hidden) {
        last = 0
        frame = requestAnimationFrame(tick)
      }
    }

    const stop = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
      if (visible) {
        start()
      } else {
        stop()
      }
    })
    intersection.observe(canvas)

    const handleVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', handleVisibility)

    start()

    return () => {
      stop()
      resizeObserver.disconnect()
      intersection.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [reduceMotion])

  if (reduceMotion) {
    return null
  }

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
