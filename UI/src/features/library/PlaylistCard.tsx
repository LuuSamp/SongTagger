import { Link } from 'react-router-dom'
import { libraryPath } from '../../app/routes'
import { playlistSongSummary, type Playlist } from '../../domain/library'
import { SongArtwork } from '../songs/SongArtwork'
import { SpotifyMark } from './SpotifyConnect'
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
      {playlist.image_url ? (
        <img className={styles.cover} src={playlist.image_url} alt="" />
      ) : (
        <span className={styles.mosaic} aria-hidden="true">
          {covers.length > 0
            ? covers.map((song) => (
                <SongArtwork
                  key={song.membership_id}
                  song={playlistSongSummary(song)}
                  variant="tile"
                />
              ))
            : null}
        </span>
      )}
      <span className={styles.name}>{playlist.name}</span>
      <span className={styles.meta}>
        {count} {count === 1 ? 'song' : 'songs'}
        {playlist.spotify_playlist_id ? (
          <span className={styles.linked} title="Linked to a Spotify playlist">
            <SpotifyMark size={12} />
            <span className="visually-hidden">Linked to Spotify</span>
          </span>
        ) : null}
      </span>
    </Link>
  )
}
