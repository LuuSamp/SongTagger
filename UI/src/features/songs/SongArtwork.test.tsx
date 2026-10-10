import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SongArtwork } from './SongArtwork'

describe('SongArtwork', () => {
  it('shows the cover image when image_url is set', () => {
    const html = renderToStaticMarkup(
      <SongArtwork
        song={{ id: 1, title: 'Yesterday', image_url: 'https://example.com/yesterday.jpg' }}
      />,
    )

    expect(html).toContain('src="https://example.com/yesterday.jpg"')
    expect(html).not.toContain('<svg')
  })

  it('shows generated art when image_url is null', () => {
    const html = renderToStaticMarkup(
      <SongArtwork song={{ id: 1, title: 'Yesterday', image_url: null }} />,
    )

    expect(html).toContain('<svg')
    expect(html).not.toContain('<img')
  })
})
