import type { ReactNode } from 'react'
import styles from './StateMessage.module.css'

interface StateMessageProps {
  tone?: 'neutral' | 'error'
  title: string
  description?: ReactNode
  action?: ReactNode
}

export function StateMessage({ tone = 'neutral', title, description, action }: StateMessageProps) {
  return (
    <div
      className={`${styles.message} ${styles[tone]}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  )
}
