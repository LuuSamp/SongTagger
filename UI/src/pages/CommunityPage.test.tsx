// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { CatalogContext, SessionContext } from '../app/contexts'
import type { CommunityFeed } from '../domain/types'
import type { CatalogService } from '../services/catalog'
import { CommunityPage } from './CommunityPage'

const feed: CommunityFeed = {
  trending_window: 'all_time',
  trending: [],
  tags_window: 'all_time',
  rising_tags: [],
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  document.body.innerHTML = ''
})

describe('Community page', () => {
  it('does not offer tag these songs in the page', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SessionContext.Provider value={{ username: 'ada' }}>
            <CatalogContext.Provider
              value={{ kind: 'http', community: () => Promise.resolve(feed) } as CatalogService}
            >
              <CommunityPage />
            </CatalogContext.Provider>
          </SessionContext.Provider>
        </MemoryRouter>,
      )
      await Promise.resolve()
    })

    const nav = container.querySelector('nav')
    expect(nav?.textContent).toContain('Discovery')
    expect(nav?.textContent).toContain('Community')
    expect(nav?.textContent).toContain('Tag these songs')
    expect(nav?.textContent).toContain('Library')
    expect(nav?.innerHTML).toContain('href="/community"')
    expect(nav?.innerHTML).toContain('href="/tag"')
    expect(container.querySelector('main')?.textContent).not.toContain('Tag these songs')
  })
})
