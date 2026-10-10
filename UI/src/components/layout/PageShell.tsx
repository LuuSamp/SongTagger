import type { ReactNode } from 'react'
import { useCatalog } from '../../app/contexts'
import { DemoNotice } from '../ui/DemoNotice'
import { AppNavBar } from './AppNavBar'
import { LandingHeader } from './LandingHeader'
import styles from './PageShell.module.css'

interface PageShellProps {
  children: ReactNode
  header?: 'landing' | 'app'
  backdrop?: ReactNode
}

export function PageShell({ children, header = 'app', backdrop }: PageShellProps) {
  const catalog = useCatalog()
  return (
    <div className={styles.shell}>
      {catalog.kind === 'mock' ? <DemoNotice /> : null}
      {header === 'app' ? <AppNavBar /> : <LandingHeader />}
      <div className={styles.stage}>
        {backdrop}
        <main className={styles.main}>{children}</main>
      </div>
      <footer className={styles.footer}>
        <p>SongTagger · Music organized by the people who listen to it.</p>
      </footer>
    </div>
  )
}
