import { describe, expect, it } from 'vitest'
import { sceneForGenre, sceneForSong } from './scenes'
import type { Tag, TagKind } from './types'

function tag(kind: TagKind, name: string): Tag {
  return { kind, name, token: name.replace(/\s+/g, '-') }
}

describe('sceneForGenre', () => {
  it.each([
    ['rock', 'nocturne'],
    ['alternative rock', 'nocturne'],
    ['heavy metal', 'nocturne'],
    ['post-punk', 'nocturne'],
    ['electronic', 'neon'],
    ['french house', 'neon'],
    ['new wave', 'neon'],
    ['jazz', 'lounge'],
    ['neo soul', 'lounge'],
    ['trip hop', 'lounge'],
    ['bossa nova', 'tropical'],
    ['mpb', 'tropical'],
    ['latin jazz', 'tropical'],
    ['dream pop', 'haze'],
    ['shoegaze', 'haze'],
    ['east coast hip hop', 'street'],
    ['jazz rap', 'street'],
    ['pop', 'daylight'],
    ['pop rock', 'daylight'],
    ['soft rock', 'daylight'],
    ['bluegrass', 'daylight'],
  ] as const)('%s is %s', (genre, scene) => {
    expect(sceneForGenre(genre)).toBe(scene)
  })
})

describe('sceneForSong', () => {
  it('lets a distinctive genre win over neutral pop genres', () => {
    const choice = sceneForSong([
      tag('artist', 'The Police'),
      tag('genre', 'pop'),
      tag('genre', 'pop rock'),
      tag('genre', 'classic rock'),
    ])
    expect(choice.scene).toBe('nocturne')
    expect(choice.reason?.name).toBe('classic rock')
  })

  it('picks the scene with most genres and breaks ties by tag order', () => {
    expect(
      sceneForSong([tag('genre', 'trip hop'), tag('genre', 'electronic'), tag('genre', 'house')])
        .scene,
    ).toBe('neon')
    expect(sceneForSong([tag('genre', 'jazz'), tag('genre', 'rock')]).scene).toBe('lounge')
  })

  it('falls back to feelings when no genre is distinctive', () => {
    const choice = sceneForSong([tag('genre', 'pop'), tag('feeling', 'late night')])
    expect(choice).toEqual({ scene: 'lounge', reason: tag('feeling', 'late night') })
  })

  it('stays in daylight when nothing matches', () => {
    expect(sceneForSong([tag('genre', 'folk')])).toEqual({
      scene: 'daylight',
      reason: tag('genre', 'folk'),
    })
    expect(sceneForSong([tag('instrument', 'piano')])).toEqual({ scene: 'daylight', reason: null })
  })
})
