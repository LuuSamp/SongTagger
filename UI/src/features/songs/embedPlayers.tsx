import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Embed } from '../../domain/embeds'
import { spotifyPlaying, youTubeStateFromMessage } from '../../domain/playback'

const SPOTIFY_API_SRC = 'https://open.spotify.com/embed/iframe-api/v1'
const SPOTIFY_API_TIMEOUT = 8000
const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com'
const IFRAME_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'

interface SpotifyController {
  addListener(event: string, callback: (event: unknown) => void): void
  destroy(): void
}

interface SpotifyIFrameApi {
  createController(
    element: HTMLElement,
    options: { uri: string; width?: string; height?: string },
    callback: (controller: SpotifyController) => void,
  ): void
}

type SpotifyWindow = Window & {
  onSpotifyIframeApiReady?: (api: SpotifyIFrameApi) => void
}

let spotifyApi: Promise<SpotifyIFrameApi> | null = null

function loadSpotifyApi(): Promise<SpotifyIFrameApi> {
  if (!spotifyApi) {
    spotifyApi = new Promise<SpotifyIFrameApi>((resolve, reject) => {
      const host = window as SpotifyWindow
      const previous = host.onSpotifyIframeApiReady
      const timer = window.setTimeout(
        () => reject(new Error('Spotify API timed out')),
        SPOTIFY_API_TIMEOUT,
      )
      host.onSpotifyIframeApiReady = (api) => {
        window.clearTimeout(timer)
        previous?.(api)
        resolve(api)
      }
      const script = document.createElement('script')
      script.src = SPOTIFY_API_SRC
      script.async = true
      script.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('Spotify API failed to load'))
      }
      document.body.appendChild(script)
    }).catch((error: unknown) => {
      spotifyApi = null
      throw error
    })
  }
  return spotifyApi
}

export interface EmbedPlayerProps {
  embed: Embed
  title: string
  className?: string
  style?: CSSProperties
  onPlayingChange: (playing: boolean) => void
}

function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function SpotifyEmbed({
  embed,
  title,
  className,
  style,
  onPlayingChange,
}: EmbedPlayerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const callback = useLatest(onPlayingChange)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host || fallback) {
      return
    }
    let cancelled = false
    let controller: SpotifyController | null = null
    const target = document.createElement('div')
    host.appendChild(target)

    loadSpotifyApi().then(
      (api) => {
        if (cancelled) {
          return
        }
        api.createController(
          target,
          { uri: `spotify:track:${embed.id}`, width: '100%', height: '100%' },
          (created) => {
            if (cancelled) {
              created.destroy()
              return
            }
            controller = created
            const frame = host.querySelector('iframe')
            frame?.setAttribute('title', title)
            created.addListener('playback_update', (event) => {
              const playing = spotifyPlaying(event)
              if (playing !== null) {
                callback.current(playing)
              }
            })
          },
        )
      },
      () => {
        if (!cancelled) {
          setFallback(true)
        }
      },
    )

    return () => {
      cancelled = true
      controller?.destroy()
      host.replaceChildren()
    }
  }, [embed.id, title, fallback, callback])

  if (fallback) {
    return (
      <iframe
        className={className}
        style={style}
        src={embed.src}
        title={title}
        allow={IFRAME_ALLOW}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    )
  }

  return <div ref={hostRef} className={className} style={style} data-embed-host="spotify" />
}

export function YouTubeEmbed({
  embed,
  title,
  className,
  style,
  onPlayingChange,
}: EmbedPlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const callback = useLatest(onPlayingChange)
  const src = `${embed.src}&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== YOUTUBE_ORIGIN || event.source !== frameRef.current?.contentWindow) {
        return
      }
      const playing = youTubeStateFromMessage(event.data)
      if (playing !== null) {
        callback.current(playing)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [callback])

  function startListening() {
    frameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      YOUTUBE_ORIGIN,
    )
  }

  return (
    <iframe
      ref={frameRef}
      className={className}
      style={style}
      src={src}
      title={title}
      allow={IFRAME_ALLOW}
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={startListening}
    />
  )
}

export function AppleEmbed({ embed, title, className, style, onPlayingChange }: EmbedPlayerProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const callback = useLatest(onPlayingChange)

  useEffect(() => {
    function handleBlur() {
      window.setTimeout(() => {
        if (document.activeElement && document.activeElement === frameRef.current) {
          callback.current(true)
        }
      }, 0)
    }
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [callback])

  return (
    <iframe
      ref={frameRef}
      className={className}
      style={style}
      src={embed.src}
      title={title}
      allow={IFRAME_ALLOW}
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}
