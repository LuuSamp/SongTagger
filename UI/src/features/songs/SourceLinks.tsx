import type { CSSProperties } from 'react'
import { sourceLabel } from '../../domain/songs'
import type { Source } from '../../domain/types'
import { SourceIcon } from './SourceIcon'
import { brandColor } from './sourceBrands'
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
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <ul className={styles.list}>
        {sources.map((source) => {
          const name = sourceLabel(source)
          return (
            <li key={`${source.name}:${source.external_id}`}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.link}
                style={{ '--brand': brandColor(source.name) } as CSSProperties}
                aria-label={`Open on ${name} (new tab)`}
              >
                <span className={styles.icon}>
                  <SourceIcon sourceName={source.name} />
                </span>
                <span>{name}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
