/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_DEBUG?: string
  readonly VITE_THEME?: 'zeno' | 'arctic' | 'hre' | 'light'

  /** v2 host for the comparison build (src/index-v2.tsx). Production renders v2 on VITE_API_URL. */
  readonly VITE_API_URL_V2?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
