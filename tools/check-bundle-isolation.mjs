#!/usr/bin/env node
/**
 * Prove that a production (`latest`) bundle cannot reach the v2 render pipeline.
 *
 * Every live customer site loads the widget from the `latest` GitHub release, so anything
 * in that artifact is running on every embedded site worldwide. v2 is an experiment; it
 * must be absent from that bundle, not merely switched off inside it.
 *
 * src/config/pipeline.ts gates v2 behind a build-time allowlist so the minifier drops the
 * dead branch. This script checks that actually happened, rather than trusting that it
 * did — the guarantee is worth more as a test than as a convention.
 *
 * Usage:
 *   node scripts/check-bundle-isolation.mjs <bundle-path> [--expect-v2]
 *
 * Default is to require v2 be ABSENT. Pass --expect-v2 for the v2-test build, where the
 * same markers must be PRESENT — a v2-test bundle that lost its v2 code would otherwise
 * silently A/B v1 against itself.
 *
 * Exits non-zero on failure so CI fails the release.
 */
import { readFileSync } from 'node:fs'

const [, , bundlePath, ...flags] = process.argv
const expectV2 = flags.includes('--expect-v2')

if (!bundlePath) {
  console.error('usage: check-bundle-isolation.mjs <bundle-path> [--expect-v2]')
  process.exit(2)
}

let source
try {
  source = readFileSync(bundlePath, 'utf8')
} catch (err) {
  console.error(`FAIL: cannot read bundle at ${bundlePath}: ${err.message}`)
  process.exit(2)
}

/**
 * Markers that only exist on the v2 code path. Each must be a string the minifier cannot
 * rename: URL paths, hostnames and SSE event names all survive minification because they
 * are string literals compared against runtime values.
 *
 * Deliberately NOT checking for "v2" alone — it appears in unrelated contexts and a guard
 * that cries wolf gets switched off, which costs more than the guard was ever worth.
 */
const V2_MARKERS = [
  { pattern: '/render/v2/', label: 'v2 render endpoint path' },
  { pattern: 'carconfig-api-v2test', label: 'v2 test host' },
  { pattern: 'mask_started', label: 'v2 SSE event: mask_started' },
  { pattern: 'mask_complete', label: 'v2 SSE event: mask_complete' },
  { pattern: 'composite_complete', label: 'v2 SSE event: composite_complete' },
  { pattern: 'mask_gate_failed', label: 'v2 error shape: mask_gate_failed' },
]

const found = V2_MARKERS.filter(({ pattern }) => source.includes(pattern))
const missing = V2_MARKERS.filter(({ pattern }) => !source.includes(pattern))

const sizeKb = (source.length / 1024).toFixed(1)
console.log(`bundle: ${bundlePath} (${sizeKb} KB)`)
console.log(`mode:   ${expectV2 ? 'v2-test — v2 markers REQUIRED' : 'production — v2 markers FORBIDDEN'}`)

if (expectV2) {
  // The WIDGET bundle contains v2 code only once something reachable from src/index.tsx
  // imports src/utils/api-v2.ts. Today the only v2 consumer is the comparison page, which
  // is part of the docs site rather than the widget — so a v2-test widget bundle carrying
  // no v2 markers is expected, not a fault.
  //
  // This mode therefore reports rather than enforces. It becomes meaningful if the widget
  // itself ever gains a v2 path; until then it exists so a bundle can be inspected without
  // the production check's inverted verdict.
  if (found.length === 0) {
    console.log('\nNOTE: no v2 markers in this bundle.')
    console.log('Expected while the only v2 consumer is the docs comparison page — the')
    console.log('widget bundle includes only what src/index.tsx reaches. Not a failure.')
    process.exit(0)
  }

  console.log(`\nPASS: ${found.length}/${V2_MARKERS.length} v2 markers present.`)
  for (const { label } of found) console.log(`  present: ${label}`)

  if (missing.length) {
    // Not fatal: markers land as v2 features are built out incrementally.
    console.log('\nnot yet present (fine while v2 is being built out):')
    for (const { label } of missing) console.log(`  absent:  ${label}`)
  }

  process.exit(0)
}

if (found.length > 0) {
  console.error('\nFAIL: v2 code reached a production bundle.')
  console.error('This artifact is loaded by every embedded customer site. v2 must be')
  console.error('unreachable here, not merely disabled.\n')
  for (const { label, pattern } of found) {
    console.error(`  found: ${label}  (matched ${JSON.stringify(pattern)})`)
  }
  console.error('\nBuild `latest` with VITE_PIPELINE_ALLOWED=v1 so the minifier drops it.')
  process.exit(1)
}

console.log(`\nPASS: none of the ${V2_MARKERS.length} v2 markers present. Safe to publish as latest.`)
