import { useId, type CSSProperties } from 'react'
import { TagChip } from '../../components/ui/TagChip'
import { discoverPath } from '../../app/routes'
import {
  groupTagsByKind,
  TAG_KIND_COLORS,
  TAG_KIND_LABELS,
  tagKey,
  visibleTags,
} from '../../domain/tags'
import type { TagKind, UserTag } from '../../domain/types'
import styles from './TagList.module.css'

interface TagListProps {
  tags: readonly UserTag[]
  pendingKeys?: ReadonlySet<string>
  onRemove?: (tag: UserTag) => void
  limitPerKind?: number
  expandedKinds?: ReadonlySet<TagKind>
  onToggleKind?: (kind: TagKind) => void
}

export function TagList({
  tags,
  pendingKeys,
  onRemove,
  limitPerKind,
  expandedKinds,
  onToggleKind,
}: TagListProps) {
  const baseId = useId()

  return (
    <div className={styles.groups}>
      {groupTagsByKind(tags).map(([kind, group]) => {
        const listId = `${baseId}-${kind}`
        const expanded = expandedKinds?.has(kind) ?? false
        const collapsible = limitPerKind !== undefined && group.length > limitPerKind
        const shown = collapsible && !expanded ? visibleTags(group, limitPerKind) : group
        const hidden = group.length - shown.length

        return (
          <section key={kind} className={styles.group} aria-labelledby={`${listId}-label`}>
            <h3 id={`${listId}-label`} className={styles.kind}>
              <span
                className={styles.dot}
                style={{ '--dot': TAG_KIND_COLORS[kind] } as CSSProperties}
                aria-hidden="true"
              />
              {TAG_KIND_LABELS[kind]}
              <span className={styles.count}>{group.length}</span>
            </h3>
            <ul id={listId} className={styles.chips}>
              {shown.map((tag) => (
                <li key={tagKey(tag)} className={styles.item}>
                  <TagChip
                    label={tag.name}
                    size="sm"
                    tone={tag.applied_by_me ? 'mine' : 'outline'}
                    to={discoverPath({ tags: [tag.token] })}
                    title={`Find songs tagged ${tag.name}`}
                    pending={pendingKeys?.has(tagKey(tag))}
                    onRemove={tag.applied_by_me && onRemove ? () => onRemove(tag) : undefined}
                    removeLabel={`Remove your tag ${tag.name}`}
                  />
                </li>
              ))}
              {collapsible ? (
                <li>
                  <button
                    type="button"
                    className={styles.more}
                    aria-expanded={expanded}
                    aria-controls={listId}
                    aria-label={
                      expanded
                        ? `Show fewer ${TAG_KIND_LABELS[kind].toLowerCase()} tags`
                        : `Show ${hidden} more ${TAG_KIND_LABELS[kind].toLowerCase()} tags`
                    }
                    onClick={() => onToggleKind?.(kind)}
                  >
                    {expanded ? 'Less' : `+${hidden}`}
                  </button>
                </li>
              ) : null}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
