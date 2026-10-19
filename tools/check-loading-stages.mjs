#!/usr/bin/env node
/**
 * Behavioural checks for the two-pass loading display.
 *
 * The stage logic has a handful of cases that are easy to get subtly wrong and impossible to
 * notice by eye, because every wrong answer still shows *some* plausible text:
 *
 *   - a cached mask drops a stage mid-render, shifting every later stage's index down
 *   - SSE events and the fallback timer race, and the display must never move backwards
 *   - the timer must not run off the end of a script that just got shorter
 *
 * Rather than mount Solid, this reimplements the same index arithmetic against the same
 * inputs. That keeps the check dependency-free (matching the other tools/ scripts), at the
 * cost of being a restatement rather than a true unit test — so it verifies the ALGORITHM,
 * and the store is written to match it. If you change resolveStageIndex or getLoadingSteps
 * in src/stores/widget-store.ts, change it here too.
 *
 * Usage: node tools/check-loading-stages.mjs
 * Exits non-zero on failure.
 */

let failures = 0

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)

  if (!ok) failures++
  const mark = ok ? 'ok   ' : 'FAIL '
  const detail = ok
    ? JSON.stringify(actual)
    : `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`

  console.log(`  ${mark} ${label}: ${detail}`)
}

// Mirrors src/config/loading-v2.ts.
const COLD = [
  { text: 'Analyzing vehicle', duration: 5300 },
  { text: 'Isolating wheels', duration: 14400 },
  { text: 'Applying finish', duration: 20500 },
  { text: 'Finishing up', duration: 5900 },
]
const STAGES = { analyzing: 0, mask: 1, fill: 2, composite: 3 }
const CACHED_OMITS = 'mask'
const CACHED = COLD.filter((_, i) => i !== STAGES[CACHED_OMITS])

const V1 = [
  { text: 'Analyzing vehicle', duration: 5000 },
  { text: 'Detecting wheels', duration: 5000 },
  { text: 'Applying finish', duration: 5000 },
  { text: 'Rendering', duration: 3400 },
]

/** A minimal stand-in for the store's loading slice. */
function createDisplay({ isV2 = false, hasAltScripts = true } = {}) {
  const alt = hasAltScripts ? { cold: COLD, cached: CACHED, stages: STAGES, cachedOmits: CACHED_OMITS } : null
  let maskCached = false
  let step = 0

  const steps = () => {
    if (!alt || !isV2) return V1

    return maskCached ? alt.cached : alt.cold
  }

  const resolve = (stage) => {
    if (!alt || !maskCached) return stage

    return stage < alt.stages[alt.cachedOmits] ? stage : stage - 1
  }

  return {
    steps,
    get step() { return step },
    get text() { return steps()[step].text },
    sync(name) {
      if (!alt || !isV2) return
      const target = resolve(alt.stages[name])

      if (target > step) step = target
    },
    setMaskCached(cached) {
      if (!cached || maskCached || !alt || !isV2) return
      maskCached = true
      const last = steps().length - 1

      if (step > last) step = last
    },
    /** Advance the fallback timer by `ms`, exactly as the 100ms interval does. */
    tick(ms) {
      for (let elapsed = 100; elapsed <= ms; elapsed += 100) {
        const s = steps()
        let total = 0

        for (let i = 0; i <= step && i < s.length; i++) total += s[i].duration
        if (elapsed >= total && step < s.length - 1) step += 1
      }
    },
  }
}

console.log('v1 render is untouched by the v2 path')
{
  const d = createDisplay({ isV2: false })

  check('uses the v1 script', d.steps().length, V1.length)
  check('starts on the first v1 stage', d.text, 'Analyzing vehicle')
  // This is the real hazard, not a hypothetical: on a v2-test build the alternate scripts
  // ARE loaded, and that build still runs v1 renders for the A/B comparison. Gating the
  // stage sync on the build alone let a stray event jump a v1 render to its final stage.
  d.sync('composite')
  check('a stray v2 event cannot move it', d.text, 'Analyzing vehicle')
  d.setMaskCached(true)
  check('and cannot shorten the v1 script', d.steps().length, V1.length)
}

console.log('\nbuild without the v2 module falls back safely')
{
  const d = createDisplay({ isV2: true, hasAltScripts: false })

  check('v2 render still gets the v1 script', d.steps().length, V1.length)
  d.sync('fill')
  check('sync is inert with no scripts', d.step, 0)
}

console.log('\ncold v2 render follows real stage events')
{
  const d = createDisplay({ isV2: true })

  check('uses the full v2 script', d.steps().map((s) => s.text), [
    'Analyzing vehicle', 'Isolating wheels', 'Applying finish', 'Finishing up',
  ])
  check('script is long enough for a ~45s render',
    d.steps().reduce((t, s) => t + s.duration, 0), 46100)

  d.sync('mask')
  check('mask event shows isolating', d.text, 'Isolating wheels')
  d.sync('fill')
  check('fill event shows applying', d.text, 'Applying finish')
  d.sync('composite')
  check('composite event shows finishing', d.text, 'Finishing up')
}

console.log('\ncached mask drops the isolating stage')
{
  const d = createDisplay({ isV2: true })

  d.setMaskCached(true)
  check('script loses one stage', d.steps().map((s) => s.text), [
    'Analyzing vehicle', 'Applying finish', 'Finishing up',
  ])
  check('script matches the ~30s cached render',
    d.steps().reduce((t, s) => t + s.duration, 0), 31700)

  d.sync('mask')
  check('mask event does NOT advance a skipped pass', d.text, 'Analyzing vehicle')
  d.sync('fill')
  check('fill maps onto the shifted index', d.text, 'Applying finish')
  d.sync('composite')
  check('composite maps onto the shifted index', d.text, 'Finishing up')
  check('and stays inside the shorter script', d.step, d.steps().length - 1)
}

console.log('\nthe display never moves backwards')
{
  const d = createDisplay({ isV2: true })

  d.sync('composite')
  d.sync('mask')
  check('an out-of-order earlier event is ignored', d.text, 'Finishing up')

  const late = createDisplay({ isV2: true })

  late.tick(46100)
  check('timer reaches the last stage', late.text, 'Finishing up')
  late.sync('fill')
  check('a late fill event does not snap back', late.text, 'Finishing up')
}

console.log('\nthe fallback timer stays in bounds')
{
  const d = createDisplay({ isV2: true })

  d.tick(200000)
  check('never runs past the final stage', d.step, COLD.length - 1)

  const shrink = createDisplay({ isV2: true })

  shrink.tick(46100)
  check('on the last cold stage before caching', shrink.step, 3)
  shrink.setMaskCached(true)
  check('clamped into the shortened script', shrink.step, 2)
  check('and still shows a real stage', shrink.text, 'Finishing up')
}

console.log('\nmask-cached is latched, not toggled')
{
  const d = createDisplay({ isV2: true })

  d.setMaskCached(false)
  check('a non-cached report changes nothing', d.steps().length, 4)
  d.setMaskCached(true)
  d.setMaskCached(true)
  check('repeat cached reports are idempotent', d.steps().length, 3)
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures} loading-stage check(s) failed.`)
  process.exit(1)
}

console.log('\nPASS: loading stage logic correct for v1, cold v2 and cached v2.')
