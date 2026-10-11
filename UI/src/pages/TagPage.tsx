import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useCatalog, useLibrary, useRecommendationService } from '../app/contexts'
import { PageShell } from '../components/layout/PageShell'
import { Button } from '../components/ui/Button'
import { StateMessage } from '../components/ui/StateMessage'
import { librarySongIds, orderTagSongs, promptChips } from '../domain/tagQueue'
import { groupTagsByKind, TAG_KIND_COLORS, TAG_KIND_LABELS, tagKey } from '../domain/tags'
import type { UserSong, UserTag } from '../domain/types'
import { CoverPlayer } from '../features/songs/CoverPlayer'
import { AddTagForm } from '../features/tags/AddTagForm'
import { useTagMutations } from '../hooks/useTagMutations'
import styles from './TagPage.module.css'

const RECOMMENDATION_LIMIT = 12

export function TagPage() {
  const catalog = useCatalog()
  const library = useLibrary()
  const recommendations = useRecommendationService()
  const [songs, setSongs] = useState<UserSong[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [done, setDone] = useState(0)
  const libraryRef = useRef(library)
  libraryRef.current = library
  const queued = useRef<Set<number> | null>(null)
  const libraryKey = useMemo(
    () => librarySongIds(library.favorites, library.playlists).join(','),
    [library.favorites, library.playlists],
  )

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
      queued.current = new Set()
      setSongs([])
      setDone(0)
      setLoadError(null)
      return
    }
    const known =
      ids.length === 0
        ? Promise.resolve([] as UserSong[])
        : Promise.all(ids.map((id) => catalog.getSong(id)))
    const picks =
      recommendations.kind === 'http'
        ? recommendations
            .recommend(Math.max(ids.length, RECOMMENDATION_LIMIT))
            .then((result) => result.songs.map((entry) => entry.song))
            .catch(() => [] as UserSong[])
        : Promise.resolve([] as UserSong[])
    Promise.all([known, picks]).then(
      ([loaded, fresh]) => {
        if (!cancelled) {
          queued.current = new Set(ids)
          setSongs(orderTagSongs(loaded, fresh, Math.random))
          setDone(0)
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
  }, [ready, attempt, catalog, recommendations])

  useEffect(() => {
    const seen = queued.current
    if (!seen) {
      return
    }
    const ids = libraryKey ? libraryKey.split(',').map(Number) : []
    const inLibrary = new Set(ids)
    const added = ids.filter((id) => !seen.has(id))
    setSongs((queue) => {
      if (!queue) {
        return queue
      }
      const [current, ...rest] = queue
      const kept = rest.filter((entry) => inLibrary.has(entry.id))
      return current ? [current, ...kept] : kept
    })
    if (added.length === 0) {
      return
    }
    added.forEach((id) => seen.add(id))
    let cancelled = false
    Promise.all(added.map((id) => catalog.getSong(id))).then(
      (loaded) => {
        if (cancelled) {
          return
        }
        const fresh = orderTagSongs(loaded)
        setSongs((queue) => {
          if (!queue || queue.length === 0) {
            return fresh
          }
          const [current, ...rest] = queue
          return current ? [current, ...fresh, ...rest] : [...fresh, ...rest]
        })
      },
      () => {
        added.forEach((id) => seen.delete(id))
      },
    )
    return () => {
      cancelled = true
    }
  }, [libraryKey, catalog])

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === 'visible') {
        libraryRef.current.reload()
        libraryRef.current.reloadFavorites()
      }
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

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
      setDone((value) => value + 1)
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

  const position = songs && song ? done + 1 : 0
  const total = done + (songs?.length ?? 0)

  return (
    <PageShell>
      <div className={styles.page}>
        <header className={styles.header}>
          <div className={styles.headline}>
            <h1 className={styles.title}>Tag these songs</h1>
            <p className={styles.intro}>
              Songs from your favorites and playlists. Confirm what you hear and help others find
              them.
            </p>
          </div>
          {position > 0 ? <QueueProgress position={position} total={total} /> : null}
        </header>
        {body}
      </div>
    </PageShell>
  )
}

function QueueProgress({ position, total }: { position: number; total: number }) {
  const done = Math.min(1, (position - 1) / Math.max(1, total))
  return (
    <div className={styles.progress}>
      <p className={styles.progressText}>
        Song <strong>{position}</strong> of {total}
      </p>
      <span className={styles.progressTrack} aria-hidden="true">
        <span className={styles.progressFill} style={{ width: `${done * 100}%` }} />
      </span>
    </div>
  )
}

function selectionSummary(count: number): string {
  if (count === 0) {
    return 'Nothing selected. Go to next skips this song.'
  }
  return `${count} ${count === 1 ? 'tag' : 'tags'} will be saved when you go to next.`
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
  const groups = groupTagsByKind(chips)

  return (
    <div className={styles.workspace}>
      <div className={styles.cover}>
        <CoverPlayer song={song}>
          <p className={styles.artTitle}>{song.title}</p>
          <p className={styles.artArtist}>{song.artist_credit}</p>
        </CoverPlayer>
      </div>

      <div className={styles.panel}>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              1
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>Listen</p>
              <p className={styles.stepHint}>Press play on the cover to hear it while you tag.</p>
            </div>
          </li>

          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              2
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>Pick what fits</p>
              <p className={styles.stepHint}>
                Other listeners tagged this song. Tap the ones you hear too.
              </p>
              {groups.length > 0 ? (
                <div className={styles.groups}>
                  {groups.map(([kind, tags]) => (
                    <div
                      key={kind}
                      className={styles.group}
                      style={{ '--kind': TAG_KIND_COLORS[kind] } as CSSProperties}
                    >
                      <p className={styles.groupLabel}>{TAG_KIND_LABELS[kind]}</p>
                      <ul
                        className={styles.suggestions}
                        aria-label={`${TAG_KIND_LABELS[kind]} tags`}
                      >
                        {tags.map((tag) => {
                          const selected = chosen.has(tagKey(tag))
                          return (
                            <li key={tagKey(tag)} className={selected ? styles.mine : undefined}>
                              <button
                                type="button"
                                className={styles.suggestion}
                                aria-pressed={selected}
                                aria-busy={saving && selected ? true : undefined}
                                title={selected ? 'Click again to undo' : undefined}
                                onClick={() => {
                                  if (!saving) {
                                    toggle(tag)
                                  }
                                }}
                              >
                                <svg
                                  className={styles.mark}
                                  viewBox="0 0 16 16"
                                  aria-hidden="true"
                                  focusable="false"
                                >
                                  {selected ? (
                                    <path d="M3.5 8.5l3 3 6-7" />
                                  ) : (
                                    <path d="M8 3.5v9M3.5 8h9" />
                                  )}
                                </svg>
                                {tag.name}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.empty}>No suggestions yet. Add your own below.</p>
              )}
            </div>
          </li>

          <li className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              3
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>Add what&apos;s missing</p>
              <p className={styles.stepHint}>Your own tags save right away.</p>
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
                <Button
                  className={styles.addButton}
                  variant="secondary"
                  onClick={() => setAdding(true)}
                >
                  Add tag
                </Button>
              )}
            </div>
          </li>
        </ol>

        <div className={styles.actions}>
          <div className={styles.actionText}>
            <p className={styles.summary} aria-live="polite">
              {selectionSummary(chosen.size)}
            </p>
            {notice && !adding ? (
              <p className={styles.error} role="alert">
                {notice}
              </p>
            ) : null}
          </div>
          <Button size="lg" busy={saving} onClick={() => void goToNext()}>
            Go to next
          </Button>
        </div>
      </div>
    </div>
  )
}
