import { APP_PATHS } from '../../app/routes'
import { ButtonLink } from '../ui/Button'
import { BrandMark } from './BrandMark'
import styles from './LandingHeader.module.css'

export function LandingHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <BrandMark to={APP_PATHS.landing} showWordmark />
        <ButtonLink to={APP_PATHS.discover} variant="secondary">
          Open app
        </ButtonLink>
      </div>
    </header>
  )
}
