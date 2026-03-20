/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_DEBUG?: string
  readonly VITE_THEME?: 'zeno' | 'arctic'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
