#!/usr/bin/env node
/**
 * Behavioural check on src/config/pipeline.ts under both build configurations.
 *
 * The bundle-isolation check proves v2 strings are absent from a production artifact.
 * This proves the resolver itself behaves correctly — in particular that a `latest` build
 * asked for v2 quietly yields v1 instead of throwing, because a customer page passing a
 * stray ?pipeline=v2 must not break.
 *
 * Runs the real module through Vite's own build with env values substituted exactly as a
 * release build substitutes them, so this tests shipped behaviour rather than a
 * reimplementation of it.
 *
 * Usage: node tools/check-pipeline-resolution.mjs
 */
import { build } from 'vite'
import { fileURLToPath } from 'node:url'

const MODULE_PATH = fileURLToPath(new URL('../src/config/pipeline.ts', import.meta.url))

async function load(env) {
  const result = await build({
    logLevel: 'silent',
    configFile: false,
    define: {
      'import.meta.env.VITE_PIPELINE_DEFAULT': JSON.stringify(env.default ?? ''),
      'import.meta.env.VITE_PIPELINE_ALLOWED': JSON.stringify(env.allowed ?? ''),
      'import.meta.env.VITE_API_URL': JSON.stringify(env.apiUrl ?? ''),
      'import.meta.env.VITE_API_URL_V2': JSON.stringify(env.apiUrlV2 ?? ''),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry: MODULE_PATH, formats: ['es'], fileName: 'pipeline' },
    },
  })

  const [{ output }] = Array.isArray(result) ? result : [result]
  const code = output[0].code

  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}

const failures = []

function check(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}`)
  if (!ok) failures.push(`${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

// ---------------------------------------------------------------------------
// The `latest` build: what every embedded customer site runs.
// ---------------------------------------------------------------------------
console.log('\nlatest build (VITE_PIPELINE_ALLOWED=v1)')
{
  const p = await load({
    default: 'v1',
    allowed: 'v1',
    apiUrl: 'https://api.platform.xix3d.com',
    // Set deliberately: even with a v2 URL in the environment, v2 must stay unreachable.
    apiUrlV2: 'https://carconfig-api-v2test.example.run.app',
  })

  check('default is v1', p.defaultPipeline(), 'v1')
  check('v1 available', p.isPipelineAvailable('v1'), true)
  check('v2 NOT available', p.isPipelineAvailable('v2'), false)
  check('cannot compare', p.canCompare(), false)
  check('explicit v2 request falls back to v1', p.resolvePipeline('v2'), 'v1')
  check('?pipeline=v2 falls back to v1', p.pipelineFromLocation('?pipeline=v2'), 'v1')
  check('garbage falls back to v1', p.resolvePipeline('../etc/passwd'), 'v1')
  check('empty falls back to v1', p.resolvePipeline(''), 'v1')
  check('null falls back to v1', p.resolvePipeline(null), 'v1')
  check('v1 base url resolves', p.apiBaseUrl('v1'), 'https://api.platform.xix3d.com')
  check('v2 base url is null even though env set', p.apiBaseUrl('v2'), null)
}

// ---------------------------------------------------------------------------
// The `v2-test` build: the comparison site only.
// ---------------------------------------------------------------------------
console.log('\nv2-test build (VITE_PIPELINE_ALLOWED=v1,v2)')
{
  const p = await load({
    default: 'v2',
    allowed: 'v1,v2',
    apiUrl: 'https://api.platform.xix3d.com',
    apiUrlV2: 'https://carconfig-api-v2test.example.run.app',
  })

  check('default is v2', p.defaultPipeline(), 'v2')
  check('v1 available', p.isPipelineAvailable('v1'), true)
  check('v2 available', p.isPipelineAvailable('v2'), true)
  check('can compare', p.canCompare(), true)
  check('explicit v1 honoured', p.resolvePipeline('v1'), 'v1')
  check('explicit v2 honoured', p.resolvePipeline('v2'), 'v2')
  check('?pipeline=v1 honoured', p.pipelineFromLocation('?pipeline=v1'), 'v1')
  check('no override uses default', p.pipelineFromLocation(''), 'v2')
  check('v2 base url resolves', p.apiBaseUrl('v2'), 'https://carconfig-api-v2test.example.run.app')
}

// ---------------------------------------------------------------------------
// Misconfiguration must degrade toward production behaviour, never away from it.
// ---------------------------------------------------------------------------
console.log('\nmisconfigured builds degrade safely')
{
  // Default names a pipeline that was never allowlisted.
  const a = await load({ default: 'v2', allowed: 'v1' })
  check('unallowlisted default falls back to v1', a.defaultPipeline(), 'v1')
  check('  and v2 stays unavailable', a.isPipelineAvailable('v2'), false)

  // No pipeline env at all — e.g. a plain `pnpm build` with no flags.
  const b = await load({})
  check('absent config defaults to v1', b.defaultPipeline(), 'v1')
  check('  and v2 stays unavailable', b.isPipelineAvailable('v2'), false)

  // Junk in the allowlist must not widen it.
  const c = await load({ default: 'v1', allowed: 'v1,v3,../v2' })
  check('junk allowlist entries ignored', c.isPipelineAvailable('v2'), false)

  // v2 allowlisted but no URL configured: must report absence, not fall through to prod.
  const d = await load({ default: 'v1', allowed: 'v1,v2', apiUrl: 'https://api.example.com' })
  check('v2 allowed but unconfigured returns null', d.apiBaseUrl('v2'), null)
}

console.log('')
if (failures.length) {
  console.error(`FAIL: ${failures.length} check(s) failed`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('PASS: pipeline resolution correct under all configurations.')
