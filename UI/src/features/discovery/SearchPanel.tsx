import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { SearchField } from '../../components/ui/SearchField'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { TagChip } from '../../components/ui/TagChip'
import { parseTokens } from '../../domain/tags'
import type { DiscoverQuery } from '../../app/routes'
import type { SongQuery } from '../../hooks/useSongSearch'
import styles from './SearchPanel.module.css'

type SearchMode = 'tags' | 'title'

const MODES = [
  { value: 'tags' as const, label: 'By tags' },
  { value: 'title' as const, label: 'By title' },
]

interface SearchPanelProps {
  query: SongQuery
  onSearch: (query: DiscoverQuery | undefined) => void
  inputId: string
}

export function SearchPanel({ query, onSearch, inputId }: SearchPanelProps) {
  const [mode, setMode] = useState<SearchMode>(query?.mode ?? 'tags')
  const [tagDraft, setTagDraft] = useState('')
  const [title, setTitle] = useState(query?.mode === 'title' ? query.title : '')
  const [artist, setArtist] = useState(query?.mode === 'title' ? query.artist : '')
  const activeTokens = query?.mode === 'tags' ? query.tokens : []

  useEffect(() => {
    if (query?.mode) {
      setMode(query.mode)
    }
    if (query?.mode === 'title') {
      setTitle(query.title)
      setArtist(query.artist)
    }
  }, [query])

  function submitTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const tokens = parseTokens(tagDraft)
    if (tokens.length === 0) {
      return
    }
    onSearch({ tags: [...new Set([...activeTokens, ...tokens])] })
    setTagDraft('')
  }

  function submitTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (title.trim()) {
      onSearch({ title: title.trim(), artist: artist.trim() || undefined })
    }
  }

  function removeToken(token: string) {
    const remaining = activeTokens.filter((current) => current !== token)
    onSearch(remaining.length > 0 ? { tags: remaining } : undefined)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.heading}>Find songs</h2>
        <SegmentedControl label="Search mode" options={MODES} value={mode} onChange={setMode} />
      </div>

      {mode === 'tags' ? (
        <form role="search" className={styles.form} onSubmit={submitTags}>
          <SearchField
            id={inputId}
            label="Add tags to the search"
            placeholder={
              activeTokens.length > 0
                ? 'Narrow down with another tag'
                : 'Type tags like mpb, jazz or dreamy'
            }
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
          />
          <Button type="submit" size="lg" disabled={!tagDraft.trim()}>
            Search
          </Button>
        </form>
      ) : (
        <form role="search" className={styles.form} onSubmit={submitTitle}>
          <SearchField
            id={inputId}
            label="Song title"
            placeholder="Exact song title, e.g. Sampa"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <SearchField
            id={`${inputId}-artist`}
            label="Artist (optional)"
            placeholder="Artist (optional)"
            value={artist}
            onChange={(event) => setArtist(event.target.value)}
            className={styles.artist}
          />
          <Button type="submit" size="lg" disabled={!title.trim()}>
            Search
          </Button>
        </form>
      )}

      {mode === 'tags' && activeTokens.length > 0 ? (
        <div className={styles.active}>
          <span className={styles.activeLabel}>Songs tagged with all of</span>
          <ul className={styles.chips}>
            {activeTokens.map((token) => (
              <li key={token}>
                <TagChip
                  label={token.replace(/-/g, ' ')}
                  tone="mine"
                  onRemove={() => removeToken(token)}
                  removeLabel={`Remove ${token} from the search`}
                />
              </li>
            ))}
          </ul>
          <Button variant="ghost" onClick={() => onSearch(undefined)}>
            Clear
          </Button>
        </div>
      ) : null}

      {mode === 'title' ? (
        <p className={styles.note}>
          Title search matches the exact title. Songs missing from the catalog are imported from
          MusicBrainz, which can take a few seconds.
        </p>
      ) : null}
    </div>
  )
}
