/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_DEBUG?: string
  readonly VITE_THEME?: 'zeno' | 'arctic' | 'hre' | 'light'

  /**
   * Two-pass (v2) render pipeline. See src/config/pipeline.ts.
   *
   * VITE_PIPELINE_ALLOWED is the build-time allowlist and is the actual safety boundary:
   * the `latest` bundle ships "v1" so v2 is statically unreachable and gets minified away.
   * VITE_PIPELINE_DEFAULT only picks between pipelines already allowlisted.
   */
  readonly VITE_PIPELINE_DEFAULT?: 'v1' | 'v2'
  readonly VITE_PIPELINE_ALLOWED?: string
  /** Base URL for the v2 pipeline — a separate host, not a path on the production API. */
  readonly VITE_API_URL_V2?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
