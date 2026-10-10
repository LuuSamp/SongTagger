import type { DataSourceKind } from '../services/catalog/CatalogService'

const DEFAULT_USERNAME = 'ada'

export interface AppConfig {
  dataSource: DataSourceKind
  username: string
  apiBaseUrl: string
}

export function readAppConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return {
    dataSource: env.VITE_DATA_SOURCE === 'http' ? 'http' : 'mock',
    username: env.VITE_SONGTAGGER_USERNAME?.trim() || DEFAULT_USERNAME,
    apiBaseUrl: '/api',
  }
}
