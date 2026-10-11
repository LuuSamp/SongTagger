import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './TagChip.module.css'

type TagChipTone = 'outline' | 'mine' | 'onDark' | 'onLight'
type TagChipSize = 'md' | 'sm'

interface TagChipProps {
  label: ReactNode
  tone?: TagChipTone
  size?: TagChipSize
  marker?: string
  to?: string
  onClick?: () => void
  onRemove?: () => void
  removeLabel?: string
  pending?: boolean
  pressed?: boolean
  title?: string
}

export function TagChip({
  label,
  tone = 'outline',
  size = 'md',
  marker,
  to,
  onClick,
  onRemove,
  removeLabel,
  pending = false,
  pressed,
  title,
}: TagChipProps) {
  const className = [
    styles.chip,
    styles[tone],
    size === 'sm' ? styles.sm : null,
    pending ? styles.pending : null,
    pressed ? styles.flash : null,
  ]
    .filter(Boolean)
    .join(' ')
  const body = (
    <span className={styles.label}>
      {marker ? (
        <span
          className={styles.marker}
          style={{ '--marker': marker } as CSSProperties}
          aria-hidden="true"
        />
      ) : null}
      {label}
    </span>
  )

  let main: ReactNode = body
  if (to) {
    main = (
      <Link to={to} className={styles.action} title={title}>
        {body}
      </Link>
    )
  } else if (onClick) {
    main = (
      <button
        type="button"
        className={styles.action}
        onClick={onClick}
        title={title}
        aria-pressed={pressed}
      >
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
