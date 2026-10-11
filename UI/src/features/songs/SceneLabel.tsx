import { Link } from 'react-router-dom'
import { discoverPath } from '../../app/routes'
import { SCENES, type SceneChoice } from '../../domain/scenes'
import styles from './SceneLabel.module.css'

export function SceneLabel({ choice }: { choice: SceneChoice }) {
  const { scene, reason } = choice
  return (
    <p className={styles.label} aria-live="polite">
      <span className={styles.swatch} aria-hidden="true" />
      <span>{SCENES[scene].label} scene</span>
      {reason ? (
        <>
          <span aria-hidden="true">·</span>
          <span>
            from{' '}
            <Link className={styles.reason} to={discoverPath({ tags: [reason.token] })}>
              {reason.name}
            </Link>
          </span>
        </>
      ) : null}
    </p>
  )
}
