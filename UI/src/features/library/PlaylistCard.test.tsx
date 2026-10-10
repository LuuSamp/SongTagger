import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Playlist } from '../../domain/library'
import { PlaylistCard } from './PlaylistCard'

const playlist: Playlist = {
  id: 7,
  name: 'Noite',
  created_at: '2026-10-10T12:00:00',
  image_url: null,
  songs: [
    {
      membership_id: 11,
      position: 1,
      song_id: 6,
      title: 'So What',
      artist_credit: 'Miles Davis',
      image_url: 'https://example.com/so-what.jpg',
    },
  ],
}

function markup(value: Playlist): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PlaylistCard playlist={value} selected={false} />
    </MemoryRouter>,
  )
}

describe('PlaylistCard', () => {
  it('shows the playlist image when the playlist has one', () => {
    const html = markup({ ...playlist, image_url: 'https://example.com/noite.jpg' })

    expect(html).toContain('src="https://example.com/noite.jpg"')
    expect(html).not.toContain('https://example.com/so-what.jpg')
  })

  it('uses song images in the mosaic when the playlist image is null', () => {
    const html = markup(playlist)

    expect(html).toContain('src="https://example.com/so-what.jpg"')
    expect(html).not.toContain('https://example.com/noite.jpg')
  })
})
