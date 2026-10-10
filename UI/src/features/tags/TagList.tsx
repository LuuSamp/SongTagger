import { TagChip } from '../../components/ui/TagChip'
import { discoverPath } from '../../app/routes'
import { groupTagsByKind, TAG_KIND_LABELS, tagKey } from '../../domain/tags'
import type { UserTag } from '../../domain/types'
import styles from './TagList.module.css'

interface TagListProps {
  tags: readonly UserTag[]
  pendingKeys?: ReadonlySet<string>
  onRemove?: (tag: UserTag) => void
}

export function TagList({ tags, pendingKeys, onRemove }: TagListProps) {
  return (
    <div className={styles.groups}>
      {groupTagsByKind(tags).map(([kind, group]) => (
        <section key={kind} className={styles.group} aria-label={`${TAG_KIND_LABELS[kind]} tags`}>
          <h3 className={styles.kind}>{TAG_KIND_LABELS[kind]}</h3>
          <ul className={styles.chips}>
            {group.map((tag) => (
              <li key={tagKey(tag)}>
                <TagChip
                  label={tag.name}
                  tone={tag.applied_by_me ? 'mine' : 'outline'}
                  to={discoverPath({ tags: [tag.token] })}
                  title={`Find songs tagged ${tag.name}`}
                  pending={pendingKeys?.has(tagKey(tag))}
                  onRemove={tag.applied_by_me && onRemove ? () => onRemove(tag) : undefined}
                  removeLabel={`Remove your tag ${tag.name}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
