import { PageShell } from '../components/layout/PageShell'
import styles from './CommunityPage.module.css'

export function CommunityPage() {
  return (
    <PageShell>
      <section className={styles.page} aria-labelledby="community-title">
        <h1 id="community-title" className={styles.title}>
          Community
        </h1>
        <p className={styles.note}>Coming soon: what the community is tagging and listening to.</p>
      </section>
    </PageShell>
  )
}
