import { sourceLabel } from '../../domain/songs'
import type { Source } from '../../domain/types'
import styles from './SourceLinks.module.css'

interface SourceLinksProps {
  label: string
  sources: readonly Source[]
}

export function SourceLinks({ label, sources }: SourceLinksProps) {
  if (sources.length === 0) {
    return null
  }
  return (
    <p className={styles.row}>
      <span className={styles.label}>{label}</span>
      {sources.map((source) => (
        <a
          key={`${source.name}:${source.external_id}`}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className={styles.link}
        >
          {sourceLabel(source)}
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      ))}
    </p>
  )
}
