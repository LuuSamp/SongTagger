import { Navigate, useLocation } from 'react-router-dom'
import { APP_PATHS } from '../app/routes'
import { PageShell } from '../components/layout/PageShell'
import { ButtonLink } from '../components/ui/Button'
import { featuredVibes, moreVibes } from '../config/vibes'
import { VibeHero } from '../features/discovery/VibeHero'
import { VibeList } from '../features/discovery/VibeList'
import styles from './LandingPage.module.css'

export function LandingPage() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)

  if (params.has('tags') || params.has('title')) {
    return <Navigate to={`${APP_PATHS.discover}${search}`} replace />
  }

  return (
    <PageShell header="landing">
      <div className={styles.hero}>
        <VibeHero vibes={featuredVibes} activeQuery={[]} />
        <aside className={styles.intro}>
          <h1 className={styles.title}>
            Discover music by
            <br />
            how it feels.
          </h1>
          <p className={styles.pitch}>
            SongTagger connects you to music through tags its listeners give it: genres, feelings,
            instruments. Every tag you add helps someone else find their next song.
          </p>
          <ButtonLink
            to={APP_PATHS.discover}
            variant="secondary"
            size="lg"
            className={styles.begin}
          >
            Let’s begin
          </ButtonLink>
          <VibeList vibes={moreVibes} />
        </aside>
      </div>
    </PageShell>
  )
}
