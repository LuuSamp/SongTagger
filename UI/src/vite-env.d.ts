/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: string
  readonly VITE_SONGTAGGER_USERNAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
