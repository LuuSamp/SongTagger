import { Link } from 'react-router-dom'
import { libraryPath } from '../../app/routes'
import type { Playlist } from '../../domain/library'
import { SongArtwork } from '../songs/SongArtwork'
import styles from './PlaylistCard.module.css'

interface PlaylistCardProps {
  playlist: Playlist
  selected: boolean
}

export function PlaylistCard({ playlist, selected }: PlaylistCardProps) {
  const covers = playlist.songs.slice(0, 4)
  const count = playlist.songs.length

  return (
    <Link
      to={libraryPath('playlists', playlist.id)}
      className={styles.card}
      aria-current={selected ? 'page' : undefined}
    >
      <span className={styles.mosaic} aria-hidden="true">
        {covers.length > 0
          ? covers.map((song) => <SongArtwork key={song.id} song={song} variant="tile" />)
          : null}
      </span>
      <span className={styles.name}>{playlist.name}</span>
      <span className={styles.meta}>
        {count} {count === 1 ? 'song' : 'songs'}
      </span>
    </Link>
  )
}
