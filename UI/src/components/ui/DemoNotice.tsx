import styles from './DemoNotice.module.css'

export function DemoNotice() {
  return (
    <p className={styles.notice} role="note">
      <strong>Demo data.</strong> Songs and tags come from a local mock catalog and reset on reload.
      Playlists need the SongTagger API (VITE_DATA_SOURCE=http).
    </p>
  )
}
