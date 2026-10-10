import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useLibrary } from '../../app/contexts'
import { Button } from '../../components/ui/Button'
import { containsSong } from '../../domain/library'
import styles from './AddToPlaylist.module.css'

const NAME_LIMIT = 255

interface AddToPlaylistProps {
  songId: number
  songTitle: string
}

function PlaylistAddIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M4 7h11M4 12h11M4 17h7M18 14v6M15 17h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function AddToPlaylist({ songId, songTitle }: AddToPlaylistProps) {
  const {
    status,
    loadError,
    playlists,
    pending,
    actionError,
    clearActionError,
    reload,
    createPlaylist,
    addSong,
    removeSong,
  } = useLibrary()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [optimistic, setOptimistic] = useState<ReadonlyMap<number, boolean>>(new Map())
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

  function toggle() {
    clearActionError()
    setOpen((value) => !value)
  }

  async function setMembership(playlistId: number, include: boolean) {
    setOptimistic((current) => new Map(current).set(playlistId, include))
    if (include) {
      await addSong(playlistId, songId)
    } else {
      await removeSong(playlistId, songId)
    }
    setOptimistic((current) => {
      const next = new Map(current)
      next.delete(playlistId)
      return next
    })
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const playlist = await createPlaylist(name)
    if (playlist && (await addSong(playlist.id, songId))) {
      setName('')
    }
  }

  const inCount = playlists.filter((playlist) => containsSong(playlist, songId)).length

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          inCount > 0
            ? `Add ${songTitle} to a playlist (in ${inCount} ${inCount === 1 ? 'playlist' : 'playlists'})`
            : `Add ${songTitle} to a playlist`
        }
        title="Add to playlist"
        onClick={toggle}
      >
        <PlaylistAddIcon />
        {inCount > 0 ? (
          <span className={styles.count} aria-hidden="true">
            {inCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className={styles.panel}
          role="group"
          aria-label="Add to playlists"
          aria-busy={pending || status === 'loading' || undefined}
        >
          <p className={styles.heading}>Save to playlist</p>
          {status === 'unavailable' ? (
            <p className={styles.empty}>
              Playlists need the SongTagger API. Run the app with VITE_DATA_SOURCE=http.
            </p>
          ) : status === 'error' ? (
            <div className={styles.errorBox}>
              <p className={styles.error}>{loadError}</p>
              <Button variant="secondary" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : status === 'loading' ? (
            <p className={styles.empty}>Loading your playlists…</p>
          ) : (
            <>
              {playlists.length > 0 ? (
                <ul className={styles.list}>
                  {playlists.map((playlist) => {
                    const saving = optimistic.has(playlist.id)
                    const checked = optimistic.get(playlist.id) ?? containsSong(playlist, songId)
                    return (
                      <li key={playlist.id}>
                        <label className={styles.option}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={saving}
                            onChange={() => setMembership(playlist.id, !checked)}
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
                  maxLength={NAME_LIMIT}
                  autoComplete="off"
                />
                <Button type="submit" disabled={!name.trim()} busy={pending}>
                  Create
                </Button>
              </form>
              {actionError ? (
                <p className={styles.error} role="alert">
                  {actionError}
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
