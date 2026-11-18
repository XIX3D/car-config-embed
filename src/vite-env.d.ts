/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_DEBUG?: string
  readonly VITE_THEME?: 'zeno' | 'arctic' | 'hre' | 'light'

  /** v2 host for the comparison build (src/index-v2.tsx). Production renders v2 on VITE_API_URL. */
  readonly VITE_API_URL_V2?: string

  /** The car-to-wheels index for "Suggested for <car>", for a local test build only (src/utils/seenOn.ts). */
  readonly VITE_SEEN_ON_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
