import { useLibrary } from '../../app/contexts'
import type { SongSummary } from '../../domain/library'
import styles from './FavoriteButton.module.css'

interface FavoriteButtonProps {
  song: SongSummary
}

export function FavoriteButton({ song }: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useLibrary()
  const active = isFavorite(song.id)

  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={active}
      aria-label={active ? `Remove ${song.title} from favorites` : `Add ${song.title} to favorites`}
      title={active ? 'Remove from favorites' : 'Add to favorites'}
      onClick={() => toggleFavorite(song)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
