import type { LoadingStep } from '../types'
import type { AltLoadingScripts } from '../stores/widget-store'

/**
 * The two-pass (v2) loading script, and the stage names the SSE handlers use to drive it.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * The same reason src/utils/api-v2.ts is: `latest` must not merely default v2 off, it must
 * not CONTAIN v2. A build-time flag can gate behaviour, but it cannot make these arrays
 * provably dead once a module the widget always loads refers to them — the store's
 * `getLoadingSteps()` is called on every render, so a direct import from constants.ts kept
 * the v2 strings in the production bundle even with the v2 branch unreachable. Verified:
 * importing from constants.ts leaked "Isolating wheels", `LOADING_STEPS_V2` and friends
 * into dist/car-config-embed.iife.js.
 *
 * Because only the v2 entry path imports this file, the exclusion from `latest` is
 * structural rather than dependent on minifier cleverness. Do not re-export any of this
 * from constants.ts.
 */

/**
 * Durations are the backend's MEASURED per-stage timings, not guesses:
 *
 *   stage              cold     cached
 *   analysing          5.3s     7.3s
 *   isolating wheels  14.4s     skipped (mask served from the session cache)
 *   applying finish   20.5s    17.1s
 *   compositing        5.9s     5.5s
 *   ------------------------------------
 *   total             45.2s    30.6s
 *
 * v1's script totals 18.4s, so reusing it here would run out at 18s and leave the user
 * staring at a frozen final message for another 27 seconds — the point at which a render
 * reads as hung.
 *
 * These durations are only a FALLBACK. Real SSE stage events drive the transitions (see
 * `syncLoadingStage` in stores/widget-store.ts); the timer just keeps the text moving
 * between events so a long stage still looks alive.
 */
export const LOADING_STEPS_V2: LoadingStep[] = [
  { text: 'Analyzing vehicle', duration: 5300 },
  { text: 'Isolating wheels', duration: 14400 },
  { text: 'Applying finish', duration: 20500 },
  { text: 'Finishing up', duration: 5900 },
]

/**
 * Stage indices into LOADING_STEPS_V2, so the SSE handlers name a stage rather than
 * hardcoding a number that silently rots if the script is reordered.
 */
export const V2_STAGE = {
  analyzing: 0,
  mask: 1,
  fill: 2,
  composite: 3,
} as const

/**
 * The script for a v2 render whose mask came from the session cache: pass 1 does not run,
 * so "Isolating wheels" is dropped rather than shown for work that is not happening.
 *
 * Precomputed rather than filtered per use — the loading timer reads the active script
 * every 100ms tick and hands it to LoadingView as a prop, so a fresh array each time would
 * churn allocations and defeat reference equality on the consumer side.
 */
export const LOADING_STEPS_V2_CACHED: LoadingStep[] = LOADING_STEPS_V2.filter(
  (_, i) => i !== V2_STAGE.mask,
)

/**
 * The scripts a v2-capable caller hands to the store, so the store never imports this
 * module itself. See `enableV2Loading` in stores/widget-store.ts.
 */
export const V2_LOADING_SCRIPTS: AltLoadingScripts = {
  cold: LOADING_STEPS_V2,
  cached: LOADING_STEPS_V2_CACHED,
  stages: V2_STAGE,
  cachedOmits: 'mask',
}
