#!/usr/bin/env node
/**
 * Build the `v2-test` artifact locally — the only build in which the two-pass (v2) render
 * pipeline is reachable.
 *
 * This mirrors what .github/workflows/release.yml does for the `v2-test` tag, so a local
 * build and a released one behave identically. Cross-platform because the repo is
 * developed on Windows and released from Ubuntu, and `VITE_X=y pnpm build` is not valid
 * PowerShell.
 *
 * The output must NOT be published to the `latest` release tag — it is for the comparison
 * site only. The isolation check run at the end distinguishes the two.
 *
 * Usage: pnpm build:v2test
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const V2_API_URL = process.env.VITE_API_URL_V2
  || 'https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app'

console.log('Building v2-test artifact')
console.log(`  pipelines allowed : v1, v2`)
console.log(`  default pipeline  : v2`)
console.log(`  v2 api            : ${V2_API_URL}`)
console.log('')

const build = spawnSync('npx', ['--yes', 'pnpm@9', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_PIPELINE_DEFAULT: 'v2',
    VITE_PIPELINE_ALLOWED: 'v1,v2',
    VITE_API_URL_V2: V2_API_URL,
  },
})

if (build.status !== 0) process.exit(build.status ?? 1)

// Confirm the v2 code actually made it in. A v2-test build that silently lost its v2 path
// would make the A/B page compare v1 against itself and read as a tie.
const verify = spawnSync(
  'node',
  ['tools/check-bundle-isolation.mjs', 'dist/car-config-embed.iife.js', '--expect-v2'],
  { cwd: ROOT, stdio: 'inherit', shell: true },
)

if (verify.status !== 0) process.exit(verify.status ?? 1)

console.log('')
console.log('Built dist/car-config-embed.iife.js as a v2-test artifact.')
console.log('Do NOT publish this to the `latest` tag — comparison site only.')
