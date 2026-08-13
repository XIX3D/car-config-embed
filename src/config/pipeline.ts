/**
 * Render pipeline selection.
 *
 * Two pipelines exist:
 *
 *   v1  single-pass. One image-model call: customer photo + wheel references + prompt.
 *       This is what every live customer site runs today.
 *
 *   v2  two-pass. Call one deletes the wheels and paints flat chroma sockets; code
 *       repairs and composites them; call two fills the sockets from studio references
 *       only; code pastes back ONLY the socket pixels. Outside-socket change goes from a
 *       measured 11-18% to ~0%, by construction rather than by prompt wording.
 *       See docs/plans/TWO_PASS_EMBED_PLAN.md.
 *
 * WHY THIS FILE EXISTS
 *
 * Every live customer site loads the widget from a single URL — the `latest` GitHub
 * release tag — so a push to `latest` updates every embedded site worldwide on the next
 * page load. v2 must therefore be unreachable from the `latest` bundle, not merely
 * defaulted off: a runtime-reachable v2 could be stumbled into by a customer, or shipped
 * by an accidental default flip.
 *
 * So selection is gated by a BUILD-TIME ALLOWLIST, not just a default. In the `latest`
 * build VITE_PIPELINE_ALLOWED is "v1", `isPipelineAvailable('v2')` is statically false,
 * and the v2 code path is dropped by the minifier. The `v2-test` build allows both so the
 * A/B page can run them side by side.
 *
 * The CI check in .github/workflows/release.yml verifies this held, rather than trusting
 * that it did.
 *
 * This is a testing mechanism, deliberately. Once v2 is proven, per-customer migration
 * belongs on the backend keyed to the embed token, so customers move individually instead
 * of everyone flipping at once.
 */

export type Pipeline = 'v1' | 'v2'

const FALLBACK: Pipeline = 'v1'

/**
 * Pipelines this build is permitted to run. Anything outside this list is unreachable at
 * runtime no matter what a caller asks for.
 */
const ALLOWED: readonly Pipeline[] = (import.meta.env.VITE_PIPELINE_ALLOWED ?? FALLBACK)
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry): entry is Pipeline => entry === 'v1' || entry === 'v2')

/**
 * The pipeline used when a caller does not ask for one. Falls back to v1 if the configured
 * default was not itself allowlisted, so a misconfigured build degrades to production
 * behaviour rather than to an unreachable state.
 */
const DEFAULT: Pipeline = (() => {
  const configured = import.meta.env.VITE_PIPELINE_DEFAULT?.trim()

  if ((configured === 'v1' || configured === 'v2') && ALLOWED.includes(configured)) {
    return configured
  }

  return FALLBACK
})()

/** Whether this build can run the given pipeline at all. */
export function isPipelineAvailable(pipeline: Pipeline): boolean {
  return ALLOWED.includes(pipeline)
}

/** True when this build can offer a choice — i.e. the A/B comparison surface is usable. */
export function canCompare(): boolean {
  return isPipelineAvailable('v1') && isPipelineAvailable('v2')
}

/** The pipeline used when nothing is explicitly requested. */
export function defaultPipeline(): Pipeline {
  return DEFAULT
}

/**
 * Resolve a requested pipeline against this build's allowlist.
 *
 * Unknown, absent, or disallowed values fall back to the build default. A caller asking
 * for v2 in the `latest` build silently gets v1 — that is the intended behaviour, and it
 * is why this never throws: a customer page passing a stray query param must not break.
 */
export function resolvePipeline(requested?: string | null): Pipeline {
  if (!requested) return DEFAULT

  const trimmed = requested.trim()

  if ((trimmed === 'v1' || trimmed === 'v2') && ALLOWED.includes(trimmed)) {
    return trimmed
  }

  return DEFAULT
}

/**
 * Base URL for a pipeline's API.
 *
 * v2 runs on a SEPARATE HOST (Cloud Run), not a different path on the production API. That
 * is a meaningful part of the isolation: the `latest` bundle cannot reach v2 because it
 * does not know the host, not merely because it does not know the path.
 *
 * Returns null when the pipeline is unavailable in this build or has no URL configured, so
 * callers must handle absence rather than falling back to production by accident.
 */
export function apiBaseUrl(pipeline: Pipeline): string | null {
  if (!isPipelineAvailable(pipeline)) return null

  if (pipeline === 'v2') {
    return import.meta.env.VITE_API_URL_V2?.trim() || null
  }

  return import.meta.env.VITE_API_URL?.trim() || 'https://api.platform.xix3d.com'
}

/**
 * Read a pipeline override from the current URL (`?pipeline=v2`).
 *
 * Only meaningful on a build that allowlists more than one pipeline; on `latest` this
 * resolves to the default regardless of what the URL says.
 */
export function pipelineFromLocation(search?: string): Pipeline {
  if (typeof window === 'undefined' && !search) return DEFAULT

  const query = search ?? window.location.search

  try {
    return resolvePipeline(new URLSearchParams(query).get('pipeline'))
  } catch {
    return DEFAULT
  }
}
