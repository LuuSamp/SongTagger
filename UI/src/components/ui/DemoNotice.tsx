import styles from './DemoNotice.module.css'

export function DemoNotice() {
  return (
    <p className={styles.notice} role="note">
      <strong>Demo data.</strong> Songs and tags come from a local mock catalog. Tag changes last
      only until you reload the page.
    </p>
  )
}
