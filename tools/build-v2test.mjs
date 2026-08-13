#!/usr/bin/env node
/**
 * Build BOTH comparison artifacts: the production v1 widget and the two-pass v2 widget.
 *
 * The comparison page loads one of each, so they are built together — a page running two
 * copies of the same pipeline would read as "v2 looks identical to v1" and be worse than no
 * test at all. Each is checked for v2 markers in the direction it should have them.
 *
 * The two differ by ENTRY POINT, not by a flag:
 *
 *   dist/car-config-embed.iife.js      <- src/index.tsx     (v1, what customers load)
 *   dist/car-config-embed-v2.iife.js   <- src/index-v2.tsx  (v2, comparison only)
 *
 * That is deliberate and load-bearing. Gating v2 with a build-time flag was tried twice and
 * failed both times: `VITE_PIPELINE_ALLOWED` is parsed at runtime so no guard built on it can
 * fold away, and `inlineDynamicImports` pulls lazy imports into the same IIFE. A separate
 * entry means src/index.tsx simply never references v2, so the isolation cannot regress
 * regardless of what the minifier decides. See src/index-v2.tsx.
 *
 * Cross-platform because the repo is developed on Windows and released from Ubuntu, and
 * `VITE_X=y pnpm build` is not valid PowerShell.
 *
 * Usage: pnpm build:v2test
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const V2_API_URL = process.env.VITE_API_URL_V2
  || 'https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app'

const V1_BUNDLE = 'dist/car-config-embed.iife.js'
const V2_BUNDLE = 'dist/car-config-embed-v2.iife.js'

function run(label, cmd, args, env) {
  console.log(`\n=== ${label} ===`)

  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  })

  if (result.status !== 0) {
    console.error(`\nFAIL: ${label}`)
    process.exit(result.status ?? 1)
  }
}

console.log('Building comparison artifacts')
console.log(`  v1 (production entry) : ${V1_BUNDLE}`)
console.log(`  v2 (comparison entry) : ${V2_BUNDLE}`)
console.log(`  v2 api                : ${V2_API_URL}`)

// v1 first: it empties dist/, so building it second would delete the v2 artifact.
run('Build v1 widget', 'npx', ['--yes', 'pnpm@9', 'build'], {
  BUILD_ENTRY: 'v1',
})

run('Build v2 widget', 'npx', ['--yes', 'pnpm@9', 'exec', 'vite', 'build'], {
  BUILD_ENTRY: 'v2',
  VITE_PIPELINE_DEFAULT: 'v2',
  VITE_PIPELINE_ALLOWED: 'v1,v2',
  VITE_API_URL_V2: V2_API_URL,
})

// The v1 artifact is the one customers load. It must carry no v2 code even here, so a slip
// in the entry split is caught locally rather than at release time.
run('Verify v1 artifact is v2-free', 'node', [
  'tools/check-bundle-isolation.mjs', V1_BUNDLE,
])

// And the v2 artifact must actually contain v2. A v2 build that silently lost its v2 path
// would make the comparison page render v1 on both sides and read as a tie.
run('Verify v2 artifact contains v2', 'node', [
  'tools/check-bundle-isolation.mjs', V2_BUNDLE, '--expect-v2',
])

console.log('')
console.log('Both artifacts built and verified.')
console.log(`  ${V1_BUNDLE}     — safe to publish as \`latest\``)
console.log(`  ${V2_BUNDLE}  — comparison site only, publish under \`v2-test\``)
