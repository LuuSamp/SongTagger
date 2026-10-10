import { Button } from '../../components/ui/Button'
import { StateMessage } from '../../components/ui/StateMessage'
import type { AsyncState } from '../../hooks/useAsync'
import type { SongQuery, SongSearchResult } from '../../hooks/useSongSearch'
import { SongGrid, SongGridSkeleton } from '../songs/SongGrid'
import styles from './SearchResults.module.css'

interface SearchResultsProps {
  query: Exclude<SongQuery, null>
  state: AsyncState<SongSearchResult>
  onRetry: () => void
}

function describe(query: Exclude<SongQuery, null>): string {
  if (query.mode === 'tags') {
    return query.tokens.map((token) => token.replace(/-/g, ' ')).join(' + ')
  }
  return query.artist ? `“${query.title}” by ${query.artist}` : `“${query.title}”`
}

export function SearchResults({ query, state, onRetry }: SearchResultsProps) {
  const label = describe(query)

  if (state.status === 'error') {
    return (
      <StateMessage
        tone="error"
        title="The search did not go through"
        description={state.error.message}
        action={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    )
  }

  if (state.status !== 'success') {
    return (
      <div className={styles.results} aria-busy="true">
        <p className={styles.summary} role="status">
          {query.mode === 'title' ? 'Searching the catalog and MusicBrainz…' : 'Searching…'}
        </p>
        <SongGridSkeleton />
      </div>
    )
  }

  const { songs, imported } = state.data

  if (songs.length === 0) {
    return (
      <StateMessage
        title={`No songs for ${label} yet`}
        description={
          query.mode === 'tags'
            ? 'Tag search only returns songs carrying every tag. Try removing one, or open a song and add the tag yourself.'
            : 'No recording with this exact title was found, not even on MusicBrainz. Check the spelling or drop the artist.'
        }
      />
    )
  }

  return (
    <div className={styles.results}>
      <p className={styles.summary} role="status">
        <strong>{songs.length}</strong> {songs.length === 1 ? 'song' : 'songs'} for {label}
        {imported ? ' · newly imported from MusicBrainz' : ''}
      </p>
      <SongGrid songs={songs} highlightTokens={query.mode === 'tags' ? query.tokens : []} />
    </div>
  )
}
