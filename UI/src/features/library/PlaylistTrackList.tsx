import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLibrary } from '../../app/contexts'
import { Button } from '../../components/ui/Button'
import { playlistSongSummary, reorderedMembershipIds, type Playlist } from '../../domain/library'
import { songPath } from '../../domain/songs'
import { useFlipList } from '../../hooks/useFlipList'
import { useSortableDrag } from '../../hooks/useSortableDrag'
import { SongArtwork } from '../songs/SongArtwork'
import styles from './PlaylistTrackList.module.css'

interface PlaylistTrackListProps {
  playlist: Playlist
}

function GripIcon() {
  return (
    <svg viewBox="0 0 12 18" width="12" height="18" aria-hidden="true">
      {[3, 9].map((x) =>
        [3, 9, 15].map((y) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />
        )),
      )}
    </svg>
  )
}

export function PlaylistTrackList({ playlist }: PlaylistTrackListProps) {
  const { reorderSongs, moveSong, removeMembership, pending } = useLibrary()
  const keys = playlist.songs.map((song) => song.membership_id)
  const flip = useFlipList(keys)
  const [announcement, setAnnouncement] = useState('')
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const handles = useRef(new Map<number, HTMLButtonElement>())

  const { draggingKey, handleProps } = useSortableDrag({
    keys,
    getItem: flip.getItem,
    disabled: pending,
    beforeDrop: flip.capture,
    onDrop(membershipId, toIndex) {
      const order = reorderedMembershipIds(playlist, membershipId, toIndex)
      const song = playlist.songs.find((entry) => entry.membership_id === membershipId)
      if (order && song) {
        setAnnouncement(`Moved ${song.title} to position ${toIndex + 1}.`)
        void reorderSongs(playlist.id, order)
      }
    },
  })

  useEffect(() => {
    if (focusKey !== null) {
      handles.current.get(focusKey)?.focus()
      setFocusKey(null)
    }
  }, [focusKey, keys])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const offset = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    const song = playlist.songs[index]
    if (!offset || !song) {
      return
    }
    event.preventDefault()
    const target = index + offset
    if (pending || target < 0 || target >= playlist.songs.length) {
      return
    }
    setAnnouncement(`Moved ${song.title} to position ${target + 1}.`)
    setFocusKey(song.membership_id)
    void moveSong(playlist.id, song.membership_id, offset)
  }

  return (
    <>
      <ol className={styles.tracks} ref={flip.listRef}>
        {playlist.songs.map((song, index) => (
          <li
            key={song.membership_id}
            ref={flip.itemRef(song.membership_id)}
            className={styles.track}
            data-dragging={draggingKey === song.membership_id || undefined}
          >
            <button
              type="button"
              ref={(element) => {
                if (element) {
                  handles.current.set(song.membership_id, element)
                } else {
                  handles.current.delete(song.membership_id)
                }
              }}
              className={styles.handle}
              aria-label={`Reorder ${song.title}. Drag, or press Arrow Up or Arrow Down.`}
              aria-disabled={pending || undefined}
              onKeyDown={(event) => handleKeyDown(event, index)}
              {...handleProps(song.membership_id)}
            >
              <GripIcon />
            </button>
            <span className={styles.position}>{index + 1}</span>
            <SongArtwork song={playlistSongSummary(song)} variant="thumb" />
            <span className={styles.text}>
              <Link to={songPath({ id: song.song_id })} className={styles.title}>
                {song.title}
              </Link>
              <span className={styles.artist}>{song.artist_credit}</span>
            </span>
            <Button
              variant="ghost"
              onClick={() => removeMembership(playlist.id, song.membership_id)}
              disabled={pending}
              aria-label={`Remove ${song.title} from ${playlist.name}`}
            >
              Remove
            </Button>
          </li>
        ))}
      </ol>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}
