import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { embeddableSources, type EmbedProvider } from '../../domain/embeds'
import type { CatalogSong } from '../../domain/types'
import { SongArtwork } from './SongArtwork'
import { AppleEmbed, SpotifyEmbed, YouTubeEmbed } from './embedPlayers'
import { SourceIcon } from './SourceIcon'
import styles from './CoverPlayer.module.css'

const PLAYERS = {
  spotify: SpotifyEmbed,
  youtube: YouTubeEmbed,
  apple_music: AppleEmbed,
} as const

interface CoverPlayerProps {
  song: CatalogSong
  children?: ReactNode
  onPlayingChange?: (playing: boolean) => void
}

export function CoverPlayer({ song, children, onPlayingChange }: CoverPlayerProps) {
  const embeds = useMemo(() => embeddableSources(song.sources), [song.sources])
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<EmbedProvider | null>(null)
  const playRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  const active = embeds.find((embed) => embed.provider === provider) ?? embeds[0] ?? null

  useEffect(() => () => onPlayingChange?.(false), [onPlayingChange])

  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
    } else if (wasOpen.current) {
      playRef.current?.focus()
    }
    wasOpen.current = open
  }, [open])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onPlayingChange?.(false)
      setOpen(false)
    }
  }

  const handlePlayingChange = (playing: boolean) => onPlayingChange?.(playing)

  function close() {
    onPlayingChange?.(false)
    setOpen(false)
  }

  function choose(next: EmbedProvider) {
    if (next !== active?.provider) {
      onPlayingChange?.(false)
    }
    setProvider(next)
  }

  if (open && active) {
    const Player = PLAYERS[active.provider]
    return (
      <div className={styles.frame} onKeyDown={handleKeyDown}>
        <div className={styles.backdrop} aria-hidden="true">
          <SongArtwork song={song} variant="tile" />
        </div>
        <Player
          key={active.src}
          embed={active}
          title={`${song.title} by ${song.artist_credit} on ${active.label}`}
          className={active.height ? styles.iframeFixed : styles.iframeVideo}
          style={
            active.height
              ? ({ '--embed-height': `${active.height}px` } as CSSProperties)
              : undefined
          }
          onPlayingChange={handlePlayingChange}
        />
        <div className={styles.controls}>
          <button
            ref={closeRef}
            type="button"
            className={styles.glass}
            onClick={close}
            aria-label="Close the player and show the cover"
            title="Close player"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {embeds.length > 1 ? (
            <div className={styles.providers} role="radiogroup" aria-label="Play on">
              {embeds.map((embed) => (
                <button
                  key={embed.provider}
                  type="button"
                  role="radio"
                  aria-checked={embed.provider === active.provider}
                  className={styles.glass}
                  onClick={() => choose(embed.provider)}
                  aria-label={`Play on ${embed.label}`}
                  title={embed.label}
                >
                  <SourceIcon sourceName={embed.provider} size={16} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.cover}>
      <SongArtwork song={song} variant="hero">
        {children}
      </SongArtwork>
      {active ? (
        <button
          ref={playRef}
          type="button"
          className={styles.play}
          onClick={() => setOpen(true)}
          aria-label={`Play ${song.title} on ${active.label}`}
          title={`Play on ${active.label}`}
        >
          <span className={styles.playIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </span>
        </button>
      ) : null}
    </div>
  )
}
