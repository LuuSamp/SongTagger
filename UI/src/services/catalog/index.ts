import type { AppConfig } from '../../config/session'
import { catalogFixtures } from '../../mocks/catalogFixtures'
import { createHttpClient } from '../http/httpClient'
import type { CatalogService } from './CatalogService'
import { createHttpCatalog } from './httpCatalog'
import { createMockCatalog } from './mockCatalog'

export function createCatalogService(config: AppConfig): CatalogService {
  if (config.dataSource === 'http') {
    return createHttpCatalog(createHttpClient(config.apiBaseUrl), config.username)
  }
  return createMockCatalog(catalogFixtures, { username: config.username })
}

export type { CatalogService, DataSourceKind } from './CatalogService'
