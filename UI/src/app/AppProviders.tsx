import { useMemo, type ReactNode } from 'react'
import { readAppConfig, type AppConfig } from '../config/session'
import { createCatalogService } from '../services/catalog'
import { createLibraryService } from '../services/library'
import { CatalogContext, SessionContext } from './contexts'
import { LibraryProvider } from './LibraryProvider'

interface AppProvidersProps {
  children: ReactNode
  config?: AppConfig
}

export function AppProviders({ children, config }: AppProvidersProps) {
  const resolvedConfig = useMemo(() => config ?? readAppConfig(), [config])
  const catalog = useMemo(() => createCatalogService(resolvedConfig), [resolvedConfig])
  const library = useMemo(() => createLibraryService(resolvedConfig), [resolvedConfig])
  const session = useMemo(() => ({ username: resolvedConfig.username }), [resolvedConfig])

  return (
    <SessionContext.Provider value={session}>
      <CatalogContext.Provider value={catalog}>
        <LibraryProvider service={library}>{children}</LibraryProvider>
      </CatalogContext.Provider>
    </SessionContext.Provider>
  )
}
