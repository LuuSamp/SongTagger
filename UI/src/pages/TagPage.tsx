import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useCatalog, useLibrary } from '../app/contexts'
import { PageShell } from '../components/layout/PageShell'
import { Button } from '../components/ui/Button'
import { StateMessage } from '../components/ui/StateMessage'
import { TagChip } from '../components/ui/TagChip'
import { librarySongIds, orderTagSongs, promptChips } from '../domain/tagQueue'
import { TAG_KIND_COLORS, tagKey } from '../domain/tags'
import type { UserSong, UserTag } from '../domain/types'
import { CoverPlayer } from '../features/songs/CoverPlayer'
import { AddTagForm } from '../features/tags/AddTagForm'
import { useTagMutations } from '../hooks/useTagMutations'
import styles from './TagPage.module.css'

export function TagPage() {
  const catalog = useCatalog()
  const library = useLibrary()
  const [songs, setSongs] = useState<UserSong[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const libraryRef = useRef(library)
  libraryRef.current = library

  const favoritesSettled =
    library.favoritesStatus === 'ready' ||
    library.favoritesStatus === 'unsupported' ||
    library.favoritesStatus === 'unavailable' ||
    library.favoritesStatus === 'error'
  const ready = library.status === 'ready' && favoritesSettled
  const blocked = library.status === 'error' || library.status === 'unavailable'

  useEffect(() => {
    if (!ready) {
      return
    }
    let cancelled = false
    const { favorites, playlists } = libraryRef.current
    const ids = librarySongIds(favorites, playlists)
    if (ids.length === 0) {
      setSongs([])
      setLoadError(null)
      return
    }
    Promise.all(ids.map((id) => catalog.getSong(id))).then(
      (loaded) => {
        if (!cancelled) {
          setSongs(orderTagSongs(loaded))
          setLoadError(null)
        }
      },
      (cause: unknown) => {
        if (!cancelled) {
          setSongs(null)
          setLoadError(cause instanceof Error ? cause.message : 'Could not load these songs.')
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [ready, attempt, catalog])

  const song = songs?.[0] ?? null
  const update = useCallback((change: (current: UserSong) => UserSong) => {
    setSongs((queue) => {
      if (!queue?.[0]) {
        return queue
      }
      return [change(queue[0]), ...queue.slice(1)]
    })
  }, [])
  const reload = useCallback(() => {
    setSongs((queue) => {
      const current = queue?.[0]
      if (!current) {
        return queue
      }
      void catalog.getSong(current.id).then((fresh) => {
        setSongs((latest) => {
          if (!latest?.[0] || latest[0].id !== fresh.id) {
            return latest
          }
          return [fresh, ...latest.slice(1)]
        })
      })
      return queue
    })
  }, [catalog])
  const tagging = useTagMutations({ songId: song?.id ?? 0, update, reload })

  const commitAndNext = useCallback(
    async (picks: readonly UserTag[]) => {
      const currentId = songs?.[0]?.id
      if (currentId === undefined) {
        return
      }
      await Promise.all(
        picks.map((tag) => catalog.addTag(currentId, { kind: tag.kind, token: tag.token })),
      )
      setSongs((queue) => (queue?.[0]?.id === currentId ? queue.slice(1) : queue))
    },
    [catalog, songs],
  )

  let body = (
    <div className={styles.loading} aria-busy="true">
      <span className="visually-hidden">Loading songs</span>
    </div>
  )
  if (blocked) {
    body = (
      <StateMessage
        tone="error"
        title="We could not load your songs"
        description={library.loadError ?? undefined}
        action={
          <Button variant="secondary" onClick={library.reload}>
            Try again
          </Button>
        }
      />
    )
  } else if (loadError) {
    body = (
      <StateMessage
        tone="error"
        title="We could not load these songs"
        description={loadError}
        action={
          <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
        }
      />
    )
  } else if (songs && song) {
    body = <TagPrompt song={song} tagging={tagging} onNext={commitAndNext} />
  } else if (songs) {
    body = <StateMessage title="Nothing to tag right now" />
  }

  return (
    <PageShell>
      <div className={styles.column}>
        <h1 className={styles.title}>Tag these songs</h1>
        {body}
      </div>
    </PageShell>
  )
}

function TagPrompt({
  song,
  tagging,
  onNext,
}: {
  song: UserSong
  tagging: ReturnType<typeof useTagMutations>
  onNext: (picks: readonly UserTag[]) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const formId = useId()
  const chips = promptChips(song)

  useEffect(() => {
    setChosen(new Set())
    setSaveError(null)
  }, [song.id])

  function toggle(tag: UserTag) {
    const key = tagKey(tag)
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  async function goToNext() {
    setSaving(true)
    setSaveError(null)
    try {
      await onNext(chips.filter((tag) => chosen.has(tagKey(tag))))
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not save these tags.')
    } finally {
      setSaving(false)
    }
  }

  const notice = saveError ?? tagging.error

  return (
    <div className={styles.prompt}>
      <CoverPlayer song={song}>
        <p className={styles.artTitle}>{song.title}</p>
        <p className={styles.artArtist}>{song.artist_credit}</p>
      </CoverPlayer>
      <ul className={styles.chips}>
        {chips.map((tag) => {
          const selected = chosen.has(tagKey(tag))
          return (
            <li key={tagKey(tag)}>
              <TagChip
                label={tag.name}
                tone={selected ? 'mine' : 'outline'}
                pressed={selected}
                marker={TAG_KIND_COLORS[tag.kind]}
                pending={saving && selected}
                title={selected ? 'Click again to undo' : undefined}
                onClick={() => {
                  if (!saving) {
                    toggle(tag)
                  }
                }}
              />
            </li>
          )
        })}
      </ul>
      {adding ? (
        <AddTagForm
          id={formId}
          defaultKind="feeling"
          onAdd={tagging.addTag}
          onClose={() => {
            setAdding(false)
            tagging.clearError()
          }}
          error={tagging.error}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add tag
        </Button>
      )}
      {notice && !adding ? (
        <p className={styles.error} role="alert">
          {notice}
        </p>
      ) : null}
      <Button busy={saving} onClick={() => void goToNext()}>
        Go to next
      </Button>
    </div>
  )
}
