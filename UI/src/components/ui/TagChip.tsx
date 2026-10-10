import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './TagChip.module.css'

type TagChipTone = 'outline' | 'mine' | 'onDark' | 'onLight'

interface TagChipProps {
  label: ReactNode
  tone?: TagChipTone
  to?: string
  onClick?: () => void
  onRemove?: () => void
  removeLabel?: string
  pending?: boolean
  title?: string
}

export function TagChip({
  label,
  tone = 'outline',
  to,
  onClick,
  onRemove,
  removeLabel,
  pending = false,
  title,
}: TagChipProps) {
  const className = [styles.chip, styles[tone], pending ? styles.pending : null]
    .filter(Boolean)
    .join(' ')
  const body = <span className={styles.label}>{label}</span>

  let main: ReactNode = body
  if (to) {
    main = (
      <Link to={to} className={styles.action} title={title}>
        {body}
      </Link>
    )
  } else if (onClick) {
    main = (
      <button type="button" className={styles.action} onClick={onClick} title={title}>
        {body}
      </button>
    )
  }

  return (
    <span className={className} aria-busy={pending || undefined}>
      {main}
      {onRemove ? (
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          disabled={pending}
          aria-label={removeLabel ?? 'Remove tag'}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path
              d="M2 2l8 8M10 2l-8 8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  )
}
