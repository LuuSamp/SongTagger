import { useId, useRef, useState } from 'react'
import type { TagKind, UserTag } from '../../domain/types'
import type { useTagMutations } from '../../hooks/useTagMutations'
import { AddTagForm } from './AddTagForm'
import { TagList } from './TagList'
import styles from './SongTagsPanel.module.css'

const LIMIT_PER_KIND = 5

interface SongTagsPanelProps {
  tags: readonly UserTag[]
  tagging: ReturnType<typeof useTagMutations>
}

export function SongTagsPanel({ tags, tagging }: SongTagsPanelProps) {
  const [expandedKinds, setExpandedKinds] = useState<ReadonlySet<TagKind>>(new Set())
  const [adding, setAdding] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const formId = useId()

  function toggleKind(kind: TagKind) {
    setExpandedKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }

  function closeForm() {
    setAdding(false)
    tagging.clearError()
    requestAnimationFrame(() => toggleRef.current?.focus())
  }

  return (
    <section className={styles.panel} aria-labelledby="tags-title">
      <div className={styles.header}>
        <h2 id="tags-title" className={styles.title}>
          Tags
          {tags.length > 0 ? <span className={styles.count}>{tags.length}</span> : null}
        </h2>
        <button
          ref={toggleRef}
          type="button"
          className={styles.add}
          aria-expanded={adding}
          aria-controls={adding ? formId : undefined}
          aria-label={adding ? 'Close the add tag form' : undefined}
          onClick={() => (adding ? closeForm() : setAdding(true))}
        >
          {adding ? (
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M3.5 12.6V5a1.5 1.5 0 0 1 1.5-1.5h7.6a1.5 1.5 0 0 1 1 .4l7 7a1.5 1.5 0 0 1 0 2.2l-7.5 7.5a1.5 1.5 0 0 1-2.2 0l-7-7a1.5 1.5 0 0 1-.4-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" />
              <path
                d="M12.5 13.5h5M15 11v5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          )}
          <span>{adding ? 'Close' : 'Add tag'}</span>
        </button>
      </div>

      {adding ? (
        <AddTagForm
          id={formId}
          defaultKind="feeling"
          onAdd={tagging.addTag}
          onClose={closeForm}
          error={tagging.error}
        />
      ) : null}

      {tags.length === 0 ? (
        <p className={styles.empty}>No tags yet. Be the first to describe this song.</p>
      ) : (
        <TagList
          tags={tags}
          pendingKeys={tagging.pendingKeys}
          onRemove={tagging.removeTag}
          limitPerKind={LIMIT_PER_KIND}
          expandedKinds={expandedKinds}
          onToggleKind={toggleKind}
        />
      )}
    </section>
  )
}
