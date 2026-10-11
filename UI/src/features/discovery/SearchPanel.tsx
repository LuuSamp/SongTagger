import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import type { DiscoverQuery } from '../../app/routes'
import { TagChip } from '../../components/ui/TagChip'
import { featuredVibes, moreVibes } from '../../config/vibes'
import { parseTokens } from '../../domain/tags'
import type { SongQuery } from '../../hooks/useSongSearch'
import styles from './SearchPanel.module.css'

type SearchMode = 'tags' | 'title'

const MODES: ReadonlyArray<{ value: SearchMode; label: string }> = [
  { value: 'tags', label: 'Tags' },
  { value: 'title', label: 'Title' },
]

const SUGGESTION_LIMIT = 6

const SUGGESTION_POOL = [
  ...new Set([...featuredVibes, ...moreVibes].flatMap((vibe) => vibe.relatedTags)),
]

interface SearchPanelProps {
  query: SongQuery
  onSearch: (query: DiscoverQuery | undefined) => void
  inputId: string
  suggestions?: readonly string[]
  titleNote?: string
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M5 12h13m-5-6 6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchGlyph() {
  return (
    <svg className={styles.glyph} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        className={styles.glyphHandle}
        d="M15.2 15.2 20 20"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function readable(token: string): string {
  return token.replace(/-/g, ' ')
}

export function SearchPanel({
  query,
  onSearch,
  inputId,
  suggestions: suggestionPool = SUGGESTION_POOL,
  titleNote,
}: SearchPanelProps) {
  const [mode, setMode] = useState<SearchMode>(query?.mode ?? 'tags')
  const [draft, setDraft] = useState('')
  const [title, setTitle] = useState(query?.mode === 'title' ? query.title : '')
  const [artist, setArtist] = useState(query?.mode === 'title' ? query.artist : '')
  const tabRefs = useRef(new Map<SearchMode, HTMLButtonElement>())
  const inputRef = useRef<HTMLInputElement>(null)
  const activeTokens = useMemo(() => (query?.mode === 'tags' ? query.tokens : []), [query])
  const noteId = `${inputId}-note`

  useEffect(() => {
    if (query?.mode) {
      setMode(query.mode)
    }
    if (query?.mode === 'title') {
      setTitle(query.title)
      setArtist(query.artist)
    }
  }, [query])

  const suggestions = useMemo(
    () =>
      suggestionPool.filter((token) => !activeTokens.includes(token)).slice(0, SUGGESTION_LIMIT),
    [activeTokens, suggestionPool],
  )

  function searchTags(tokens: string[]) {
    onSearch(tokens.length > 0 ? { tags: tokens } : undefined)
  }

  function commitDraft() {
    const tokens = parseTokens(draft)
    if (tokens.length === 0) {
      return
    }
    searchTags([...new Set([...activeTokens, ...tokens])])
    setDraft('')
  }

  function submitTags(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    commitDraft()
  }

  function handleTagKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && draft === '' && activeTokens.length > 0) {
      event.preventDefault()
      searchTags(activeTokens.slice(0, -1))
    }
  }

  function submitTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (title.trim()) {
      onSearch({ title: title.trim(), artist: artist.trim() || undefined })
    }
  }

  function focusFieldInput(event: MouseEvent<HTMLFormElement>) {
    if (event.target === event.currentTarget) {
      inputRef.current?.focus()
    }
  }

  function handleTabKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    event.preventDefault()
    const next: SearchMode = mode === 'tags' ? 'title' : 'tags'
    setMode(next)
    tabRefs.current.get(next)?.focus()
  }

  return (
    <section className={styles.composer} aria-label="Find songs">
      <div className={styles.tabs} role="tablist" aria-label="Search by">
        {MODES.map((option) => (
          <button
            key={option.value}
            ref={(element) => {
              if (element) {
                tabRefs.current.set(option.value, element)
              }
            }}
            type="button"
            role="tab"
            id={`${inputId}-tab-${option.value}`}
            aria-selected={mode === option.value}
            aria-controls={`${inputId}-panel`}
            tabIndex={mode === option.value ? 0 : -1}
            className={styles.tab}
            onClick={() => setMode(option.value)}
            onKeyDown={handleTabKeys}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        id={`${inputId}-panel`}
        role="tabpanel"
        aria-labelledby={`${inputId}-tab-${mode}`}
        className={styles.panel}
      >
        {mode === 'tags' ? (
          <>
            <form
              role="search"
              className={styles.field}
              onSubmit={submitTags}
              onClick={focusFieldInput}
              data-typing={draft.trim() ? true : undefined}
            >
              <SearchGlyph />
              {activeTokens.length > 0 ? (
                <ul className={styles.chips} aria-label="Searching for songs tagged with all of">
                  {activeTokens.map((token) => (
                    <li key={token}>
                      <TagChip
                        label={readable(token)}
                        tone="mine"
                        onRemove={() => searchTags(activeTokens.filter((entry) => entry !== token))}
                        removeLabel={`Remove ${readable(token)} from the search`}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="visually-hidden" htmlFor={inputId}>
                Add a tag to the search
              </label>
              <input
                ref={inputRef}
                id={inputId}
                className={styles.input}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleTagKeys}
                placeholder={
                  activeTokens.length > 0 ? 'Add another tag' : 'Type a tag: mpb, jazz, late-night…'
                }
                autoComplete="off"
                enterKeyHint="search"
              />
              <span className={styles.fieldActions}>
                {activeTokens.length > 0 && !draft ? (
                  <button type="button" className={styles.clear} onClick={() => searchTags([])}>
                    Clear
                  </button>
                ) : null}
                {draft.trim() ? (
                  <button type="submit" className={styles.submit} aria-label="Search">
                    <ArrowIcon />
                  </button>
                ) : null}
              </span>
            </form>
            {suggestions.length > 0 ? (
              <div className={styles.suggestions}>
                <span className={styles.hint}>
                  {activeTokens.length > 0 ? 'Narrow it down' : 'Try'}
                </span>
                <ul className={styles.chips}>
                  {suggestions.map((token) => (
                    <li key={token}>
                      <TagChip
                        label={readable(token)}
                        onClick={() => searchTags([...activeTokens, token])}
                        title={`Add ${readable(token)} to the search`}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <form
              role="search"
              className={styles.field}
              onSubmit={submitTitle}
              onClick={focusFieldInput}
              data-typing={title.trim() ? true : undefined}
            >
              <SearchGlyph />
              <label className="visually-hidden" htmlFor={inputId}>
                Song title
              </label>
              <input
                ref={inputRef}
                id={inputId}
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Song title"
                autoComplete="off"
                enterKeyHint="search"
                aria-describedby={noteId}
              />
              <span className={styles.divider} aria-hidden="true" />
              <span className={styles.by} aria-hidden="true">
                by
              </span>
              <label className="visually-hidden" htmlFor={`${inputId}-artist`}>
                Artist (optional)
              </label>
              <input
                id={`${inputId}-artist`}
                className={`${styles.input} ${styles.artist}`}
                value={artist}
                onChange={(event) => setArtist(event.target.value)}
                placeholder="Artist (optional)"
                autoComplete="off"
                enterKeyHint="search"
              />
              <span className={styles.fieldActions}>
                {title.trim() ? (
                  <button type="submit" className={styles.submit} aria-label="Search">
                    <ArrowIcon />
                  </button>
                ) : null}
              </span>
            </form>
            <p id={noteId} className={styles.hint}>
              {titleNote ??
                'Matches the exact title. Songs missing from the catalog are imported from MusicBrainz, which can take a few seconds.'}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
