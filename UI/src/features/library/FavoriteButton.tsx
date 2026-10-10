import { useId, useState } from 'react'
import { useLibrary } from '../../app/contexts'
import type { SongSummary } from '../../domain/library'
import styles from './FavoriteButton.module.css'

interface FavoriteButtonProps {
  song: SongSummary
}

const UNAVAILABLE_NOTES = {
  unsupported: 'Favorites are coming soon. The API does not have favorites endpoints yet.',
  unavailable: 'Favorites need the SongTagger API. Run the app with VITE_DATA_SOURCE=http.',
}

export function FavoriteButton({ song }: FavoriteButtonProps) {
  const { favoritesStatus, favoritesError, favoriteActionError, isFavorite, toggleFavorite } =
    useLibrary()
  const [showNote, setShowNote] = useState(false)
  const [popKey, setPopKey] = useState(0)
  const noteId = useId()
  const active = isFavorite(song.id)
  const ready = favoritesStatus === 'ready'

  const note =
    favoritesStatus === 'unsupported' || favoritesStatus === 'unavailable'
      ? UNAVAILABLE_NOTES[favoritesStatus]
      : favoritesStatus === 'error'
        ? (favoritesError ?? 'Could not load your favorites.')
        : favoriteActionError

  function handleClick() {
    if (!ready) {
      setShowNote((value) => !value)
      return
    }
    setPopKey((value) => value + 1)
    void toggleFavorite(song)
  }

  const label = ready
    ? active
      ? `Remove ${song.title} from favorites`
      : `Add ${song.title} to favorites`
    : `Favorites unavailable for ${song.title}`

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={styles.button}
        aria-pressed={ready ? active : undefined}
        aria-disabled={!ready || undefined}
        aria-label={label}
        aria-describedby={note ? noteId : undefined}
        title={
          ready ? (active ? 'Remove from favorites' : 'Add to favorites') : 'Favorites unavailable'
        }
        data-status={favoritesStatus}
        onClick={handleClick}
        onBlur={() => setShowNote(false)}
      >
        <svg
          key={popKey}
          className={popKey > 0 ? styles.pop : undefined}
          viewBox="0 0 24 24"
          width="22"
          height="22"
          aria-hidden="true"
        >
          <path
            d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"
            fill={active ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {note && (showNote || favoriteActionError) ? (
        <p id={noteId} className={styles.note} role="status">
          {note}
        </p>
      ) : note ? (
        <span id={noteId} className="visually-hidden">
          {note}
        </span>
      ) : null}
    </div>
  )
}
