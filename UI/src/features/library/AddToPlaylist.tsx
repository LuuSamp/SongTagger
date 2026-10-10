import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLibrary } from '../../app/contexts'
import { Button } from '../../components/ui/Button'
import type { SongSummary } from '../../domain/library'
import styles from './AddToPlaylist.module.css'

interface AddToPlaylistProps {
  song: SongSummary
}

export function AddToPlaylist({ song }: AddToPlaylistProps) {
  const { library, createPlaylist, addToPlaylist, removeFromPlaylist } = useLibrary()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    function handlePointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const playlist = createPlaylist(name)
    if (playlist) {
      addToPlaylist(playlist.id, song)
      setName('')
    }
  }

  const inCount = library.playlists.filter((playlist) =>
    playlist.songs.some((entry) => entry.id === song.id),
  ).length

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        + Playlist{inCount > 0 ? <span className={styles.count}>{inCount}</span> : null}
      </button>
      {open ? (
        <div id={panelId} className={styles.panel} role="group" aria-label="Add to playlists">
          <p className={styles.heading}>Save to playlist</p>
          {library.playlists.length > 0 ? (
            <ul className={styles.list}>
              {library.playlists.map((playlist) => {
                const checked = playlist.songs.some((entry) => entry.id === song.id)
                return (
                  <li key={playlist.id}>
                    <label className={styles.option}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          checked
                            ? removeFromPlaylist(playlist.id, song.id)
                            : addToPlaylist(playlist.id, song)
                        }
                      />
                      <span>{playlist.name}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.empty}>No playlists yet.</p>
          )}
          <form className={styles.create} onSubmit={handleCreate}>
            <label className="visually-hidden" htmlFor={`${panelId}-name`}>
              New playlist name
            </label>
            <input
              id={`${panelId}-name`}
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New playlist"
              maxLength={80}
              autoComplete="off"
            />
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
