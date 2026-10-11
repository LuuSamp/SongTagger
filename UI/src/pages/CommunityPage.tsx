import { useMemo, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { APP_PATHS, discoverPath } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { Button, ButtonLink } from '../components/ui/Button'
import { StateMessage } from '../components/ui/StateMessage'
import { TagChip } from '../components/ui/TagChip'
import { songPath } from '../domain/songs'
import { TAG_KIND_COLORS } from '../domain/tags'
import type { CommunityFeed, RisingTag, TrendingSong } from '../domain/types'
import { SongShelf } from '../features/discovery/SongShelf'
import { SongArtwork } from '../features/songs/SongArtwork'
import { useCommunity } from '../hooks/useCommunity'
import styles from './CommunityPage.module.css'

const SHELF_SIZE = 5
const CONSENSUS_SONGS = 3

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

function trendingNote(item: TrendingSong): string {
  const parts = [plural(item.people, 'person', 'people')]
  if (item.playlist_adds > 0) {
    parts.push(plural(item.playlist_adds, 'playlist', 'playlists'))
  }
  if (item.likes > 0) {
    parts.push(plural(item.likes, 'favorite', 'favorites'))
  }
  return parts.join(' · ')
}

export function CommunityPage() {
  const { state, reload } = useCommunity()

  return (
    <PageShell>
      <header className={styles.intro}>
        <h1 className={styles.title}>Community</h1>
        <p className={styles.subtitle}>
          What everyone is tagging and saving. Counts are anonymous and only show once at least two
          people agree.
        </p>
      </header>

      {state.status === 'error' ? (
        <StateMessage
          tone="error"
          title="We could not load the community feed"
          description={state.error.message}
          action={
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        />
      ) : state.data ? (
        <CommunityFeedView feed={state.data} />
      ) : (
        <div className={styles.sections} aria-busy="true">
          <SongShelf
            id="trending-loading"
            eyebrow="Trending"
            title="Across the community"
            songs={null}
          />
        </div>
      )}
    </PageShell>
  )
}

function CommunityFeedView({ feed }: { feed: CommunityFeed }) {
  const notes = useMemo(
    () => new Map(feed.trending.map((item) => [item.song.id, trendingNote(item)])),
    [feed.trending],
  )

  if (feed.trending.length === 0 && feed.rising_tags.length === 0) {
    return (
      <StateMessage
        title="The community is just getting started"
        description="Trends appear once at least two people tag or save the same songs. Add some tags on Discovery to get things moving."
        action={
          <ButtonLink to={APP_PATHS.discover} variant="secondary">
            Go to Discovery
          </ButtonLink>
        }
      />
    )
  }

  const weekly = feed.trending_window === 'week'
  const first = feed.trending.slice(0, SHELF_SIZE)
  const second = feed.trending.slice(SHELF_SIZE, SHELF_SIZE * 2)

  return (
    <div className={styles.sections}>
      {first.length > 0 ? (
        <SongShelf
          id="trending"
          eyebrow={weekly ? 'Trending this week' : 'All-time favorites'}
          title="Across the community"
          songs={first.map((item) => item.song)}
          notes={notes}
        />
      ) : null}

      {feed.rising_tags.length > 0 ? (
        <RisingTags tags={feed.rising_tags} weekly={feed.tags_window === 'week'} />
      ) : null}

      {second.length > 0 ? (
        <SongShelf
          id="catching-on"
          eyebrow={weekly ? 'Also this week' : 'Also loved'}
          title="Catching on"
          songs={second.map((item) => item.song)}
          notes={notes}
        />
      ) : null}

      {feed.trending.some((item) => item.consensus.length > 0) ? (
        <Consensus items={feed.trending.slice(0, CONSENSUS_SONGS)} />
      ) : null}
    </div>
  )
}

function RisingTags({ tags, weekly }: { tags: readonly RisingTag[]; weekly: boolean }) {
  return (
    <section className={styles.block} aria-labelledby="rising-tags-title">
      <h2 id="rising-tags-title" className={styles.blockTitle}>
        <span className={styles.eyebrow}>{weekly ? 'Rising tags' : 'Most used tags'}</span>
        What people are calling music
      </h2>
      <ul className={styles.rising}>
        {tags.map((entry) => (
          <li key={`${entry.tag.kind}:${entry.tag.token}`} className={styles.risingItem}>
            <TagChip
              label={entry.tag.name}
              size="sm"
              marker={TAG_KIND_COLORS[entry.tag.kind]}
              to={discoverPath({ tags: [entry.tag.token] })}
              title={`Find songs tagged ${entry.tag.name}`}
            />
            <span className={styles.risingMeta}>
              {plural(entry.people, 'person', 'people')}
              {weekly && entry.growth > 1 ? (
                <span className={styles.growth} title="Growing faster than the previous weeks">
                  ↑
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Consensus({ items }: { items: readonly TrendingSong[] }) {
  return (
    <section className={styles.block} aria-labelledby="consensus-title">
      <h2 id="consensus-title" className={styles.blockTitle}>
        <span className={styles.eyebrow}>How the community hears it</span>
        In their words
      </h2>
      <ul className={styles.consensus}>
        {items
          .filter((item) => item.consensus.length > 0)
          .map((item) => (
            <li key={item.song.id} className={styles.consensusRow}>
              <Link
                to={songPath(item.song)}
                className={styles.consensusSong}
                aria-label={`${item.song.title} by ${item.song.artist_credit}`}
              >
                <SongArtwork song={item.song} variant="thumb" />
                <span className={styles.consensusText}>
                  <span className={styles.consensusTitle}>{item.song.title}</span>
                  <span className={styles.consensusArtist}>{item.song.artist_credit}</span>
                </span>
              </Link>
              <ul
                className={styles.consensusTags}
                aria-label={`Community tags on ${item.song.title}`}
              >
                {item.consensus.map((tag) => (
                  <li key={`${tag.kind}:${tag.token}`}>
                    <TagChip
                      label={
                        <span className={styles.consensusLabel}>
                          {tag.name}
                          <span
                            className={styles.people}
                            style={{ '--weight': Math.min(1, tag.people / 3) } as CSSProperties}
                          >
                            {tag.people}
                          </span>
                        </span>
                      }
                      size="sm"
                      marker={TAG_KIND_COLORS[tag.kind]}
                      to={discoverPath({ tags: [tag.token] })}
                      title={`${plural(tag.people, 'person calls', 'people call')} it ${tag.name}`}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </section>
  )
}
