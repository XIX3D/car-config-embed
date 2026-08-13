<script setup lang="ts">
/**
 * A/B comparison harness: single-pass (v1) against two-pass (v2), same inputs, side by
 * side.
 *
 * Why side by side matters: the defects v2 targets — structure drift toward a generic
 * five-spoke, colour migration into calipers, deleted signature features — are obvious
 * when compared and nearly invisible in isolation. Judging one render alone is how they
 * shipped in the first place.
 *
 * This page is also v2's real-photo coverage. The backend verified it on ONE photo (a pink
 * Porsche 911, 6 renders); the compositor's 80+ unit tests use synthetic fixtures. The
 * photo classes listed in the UI are the ones most likely to break it, so upload those
 * deliberately rather than whatever is handy.
 *
 * Status: shell. v1 runs on both sides until renderV2 is wired to the live endpoint, which
 * is why the v2 column reports a "not yet wired" notice rather than silently duplicating
 * v1 and reading as a tie.
 */
import { computed, ref } from 'vue'

const V1_API = 'https://api.platform.xix3d.com'
const V2_API = 'https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app'

/**
 * Test Co (manufacturer 8). Renders here are logged with counts_toward_usage=false, so
 * nothing on this page bills a customer account. Product 556 looks equivalent but its
 * reference image 404s in GCS and fails on v1 too — avoid it.
 */
const TEST_PRODUCT_ID = 559
const TEST_VARIANTS = [
  { id: 22, name: 'Brushed Oxford Gold' },
  { id: 23, name: 'Firecracker Black' },
  { id: 24, name: 'Polished Classic Bronze' },
  { id: 25, name: 'Zeno Polished Carbon Red' },
]

/**
 * The cases most likely to break v2, from the backend's own open items. Offered as a
 * checklist because untargeted testing will mostly re-cover the easy case that already
 * works.
 */
const COVERAGE_CASES = [
  { id: 'dark', label: 'Dark / low-light scene', why: 'Broke the absolute luminance gate — it measured the photograph, not the finish.' },
  { id: 'small', label: 'Small wheel in a large frame', why: 'A ~350px wheel in a 2528px frame spends the model\'s detail budget on tarmac.' },
  { id: 'occluded', label: 'Partially occluded wheel', why: 'The far-side crescent the convex-hull guard exists to protect. Most likely to trip a blob-count warning.' },
  { id: 'coloured', label: 'Strongly coloured original wheels', why: 'The colour-migration case v2 is built to fix — faded red wheels once produced hallucinated red calipers.' },
  { id: 'foliage', label: 'Green-heavy background', why: 'The chroma collision the magenta key was chosen to avoid. Worth confirming rather than assuming.' },
]

type Pipeline = 'v1' | 'v2'

interface Metrics {
  outsideVerdict?: 'PASS' | 'REVIEW' | 'FAIL'
  outsideChangePct?: number
  residualChromaPct?: number
  maskCached?: boolean
  maskAttempts?: number
  maskDurationMs?: number
  compositeDurationMs?: number
  sockets?: number
  blobCountWarning?: string
}

interface Side {
  pipeline: Pipeline
  label: string
  imageUrl: string | null
  error: string | null
  errorRetryable: boolean | null
  stage: string
  loading: boolean
  elapsed: string | null
  metrics: Metrics
}

function emptySide(pipeline: Pipeline, label: string): Side {
  return {
    pipeline,
    label,
    imageUrl: null,
    error: null,
    errorRetryable: null,
    stage: '',
    loading: false,
    elapsed: null,
    metrics: {},
  }
}

const uploadedFile = ref<File | null>(null)
const previewUrl = ref('')
const selectedVariantId = ref<number>(TEST_VARIANTS[0].id)
const coverageTags = ref<string[]>([])
const dragOver = ref(false)
const running = ref(false)

const left = ref<Side>(emptySide('v1', 'v1 — single pass'))
const right = ref<Side>(emptySide('v2', 'v2 — two pass'))

/**
 * One UUID for the whole page session. This is what keys the backend's mask cache: the
 * second and third finishes on the same photo skip pass 1 entirely (~14s and one model
 * call saved). A non-UUID value is silently replaced per request, which still renders but
 * pays full price every time — a failure mode with no visible symptom.
 */
const sessionId = ref(crypto.randomUUID())

const verdicts = ref<Array<{ photo: string; variant: string; winner: string; note: string }>>([])
const pendingNote = ref('')

const canRender = computed(() => !!uploadedFile.value && !running.value)

const selectedVariantName = computed(
  () => TEST_VARIANTS.find(v => v.id === selectedVariantId.value)?.name ?? '',
)

const tally = computed(() => {
  const counts = { v1: 0, v2: 0, tie: 0 }
  for (const v of verdicts.value) {
    if (v.winner === 'v1') counts.v1 += 1
    else if (v.winner === 'v2') counts.v2 += 1
    else counts.tie += 1
  }
  return counts
})

function setImage(file: File) {
  if (!file.type.startsWith('image/')) return
  uploadedFile.value = file
  previewUrl.value = URL.createObjectURL(file)
  left.value = emptySide('v1', 'v1 — single pass')
  right.value = emptySide('v2', 'v2 — two pass')
}

function onFileInput(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) setImage(file)
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) setImage(file)
}

function toggleCoverage(id: string) {
  const i = coverageTags.value.indexOf(id)
  if (i === -1) coverageTags.value.push(id)
  else coverageTags.value.splice(i, 1)
}

function newSession() {
  sessionId.value = crypto.randomUUID()
}

/** Shared SSE reader. v2 adds events; unknown ones are ignored by both. */
async function streamRender(side: Side, apiBase: string, path: string, blob: Blob) {
  const started = performance.now()

  side.loading = true
  side.error = null
  side.errorRetryable = null
  side.imageUrl = null
  side.stage = 'starting'
  side.metrics = {}

  const formData = new FormData()

  formData.append('vehicle_image', blob, 'vehicle.png')
  formData.append('products', JSON.stringify([
    { product_id: TEST_PRODUCT_ID, variant_id: selectedVariantId.value },
  ]))
  formData.append('manufacturer_id', '8')
  formData.append('fast_mode', 'true')
  formData.append('debug', 'true')

  try {
    const res = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'X-Session-ID': sessionId.value },
      body: formData,
    })

    if (!res.ok) {
      side.error = `Request failed (${res.status})`
      side.errorRetryable = res.status >= 500
      side.loading = false
      return
    }

    const reader = res.body?.getReader()

    if (!reader) {
      side.error = 'Streaming not supported in this browser'
      side.loading = false
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const chunks = buffer.split('\n\n')

      buffer = chunks.pop() || ''

      for (const chunk of chunks) {
        const eventMatch = chunk.match(/^event: (.+)$/m)
        const dataMatch = chunk.match(/^data: (.+)$/m)

        if (!eventMatch || !dataMatch) continue

        try {
          handleEvent(side, eventMatch[1], JSON.parse(dataMatch[1]), started)
        } catch { /* malformed frame — skip */ }
      }
    }

    if (side.loading) {
      side.loading = false
      if (!side.imageUrl && !side.error) side.error = 'Stream ended without a result'
    }
  } catch (e) {
    side.error = e instanceof Error ? e.message : 'Unknown error'
    side.loading = false
  }
}

function handleEvent(side: Side, event: string, data: Record<string, any>, started: number) {
  switch (event) {
    case 'vehicle_detected':
      side.stage = `detected ${data.year ?? ''} ${data.make ?? ''} ${data.model ?? ''}`.trim()
      break

    // --- v2-only stages -----------------------------------------------------
    case 'mask_started':
      side.metrics.maskCached = !!data.cached
      side.stage = data.cached ? 'mask (cached)' : 'isolating wheels'
      break

    case 'mask_complete':
      side.metrics.maskCached = !!data.cached
      side.metrics.maskAttempts = data.attempts
      side.metrics.maskDurationMs = data.duration_ms
      side.metrics.sockets = data.sockets
      // Only present on a socket-count mismatch. This is the signature of an invented
      // socket — the chroma-collision failure that every other gate is blind to.
      if (data.blob_count_warning) side.metrics.blobCountWarning = data.blob_count_warning
      break

    case 'fill_started':
      side.stage = 'applying finish'
      break

    case 'composite_complete':
      side.metrics.outsideVerdict = data.outside_verdict
      side.metrics.outsideChangePct = data.outside_change_pct
      side.metrics.residualChromaPct = data.residual_chroma_pct
      side.metrics.compositeDurationMs = data.duration_ms
      side.stage = 'quality check'
      break

    // --- shared -------------------------------------------------------------
    case 'complete':
      if (data.image_b64) {
        side.imageUrl = `data:image/png;base64,${data.image_b64}`
        side.elapsed = ((performance.now() - started) / 1000).toFixed(1)
        side.stage = 'done'
        side.loading = false
      }
      break

    case 'error':
      side.error = data.message || 'Render error'
      // model_refused and mask_gate_failed must NOT offer a retry: the request bytes are
      // identical next time, and the reference measured one combination refusing 12
      // consecutive times. Only render_failed is worth retrying.
      side.errorRetryable = data.retryable === true
      if (Array.isArray(data.reasons) && data.reasons.length) {
        side.error += ` (${data.reasons.join('; ')})`
      }
      side.loading = false
      break

    default:
      break
  }
}

async function runComparison() {
  if (!canRender.value || !uploadedFile.value) return

  running.value = true

  const blob = uploadedFile.value

  // Both pipelines fire concurrently against identical inputs.
  await Promise.all([
    streamRender(left.value, V1_API, '/api/v1/render/chain/stream', blob),
    streamRender(right.value, V2_API, '/api/v1/render/v2/chain/stream', blob),
  ])

  running.value = false
}

function recordVerdict(winner: 'v1' | 'v2' | 'tie') {
  verdicts.value.push({
    photo: uploadedFile.value?.name ?? 'unknown',
    variant: selectedVariantName.value,
    winner,
    note: [pendingNote.value, ...coverageTags.value].filter(Boolean).join(' | '),
  })
  pendingNote.value = ''
}

function exportVerdicts() {
  const blob = new Blob([JSON.stringify(verdicts.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')

  a.href = url
  a.download = 'v2-comparison-verdicts.json'
  a.click()
  URL.revokeObjectURL(url)
}

function fmtMs(ms?: number) {
  return typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}s` : '—'
}
</script>

<template>
  <div class="v2c">
    <div class="v2c-notice">
      <strong>Test rig.</strong> Renders here run against Test Co (manufacturer 8) and are
      logged as non-billable. v2 is wheels-only and accepts one product per request.
    </div>

    <section class="v2c-panel">
      <h3>1. Photo</h3>
      <div
        class="v2c-drop"
        :class="{ 'is-over': dragOver }"
        @dragover.prevent="dragOver = true"
        @dragleave="dragOver = false"
        @drop="onDrop"
      >
        <img v-if="previewUrl" :src="previewUrl" alt="Selected vehicle" />
        <p v-else>Drop a car photo here, or</p>
        <input type="file" accept="image/*" @change="onFileInput" />
      </div>

      <details class="v2c-coverage">
        <summary>What is worth testing (v2 has thin real-photo coverage)</summary>
        <p class="v2c-hint">
          v2 is verified on one photo so far. Tag what this photo exercises — it is
          recorded with the verdict.
        </p>
        <label v-for="c in COVERAGE_CASES" :key="c.id" class="v2c-case">
          <input
            type="checkbox"
            :checked="coverageTags.includes(c.id)"
            @change="toggleCoverage(c.id)"
          />
          <span><strong>{{ c.label }}</strong> — {{ c.why }}</span>
        </label>
      </details>
    </section>

    <section class="v2c-panel">
      <h3>2. Finish</h3>
      <div class="v2c-variants">
        <button
          v-for="v in TEST_VARIANTS"
          :key="v.id"
          class="v2c-variant"
          :class="{ 'is-active': selectedVariantId === v.id }"
          @click="selectedVariantId = v.id"
        >
          {{ v.name }}
        </button>
      </div>

      <div class="v2c-session">
        <span>Session <code>{{ sessionId.slice(0, 8) }}…</code></span>
        <button class="v2c-link" @click="newSession">new session</button>
        <span class="v2c-hint">
          Keeping the session reuses the mask — later finishes skip pass 1 (~14s and one
          model call). Start a new one to measure a cold render.
        </span>
      </div>

      <button class="v2c-run" :disabled="!canRender" @click="runComparison">
        {{ running ? 'Rendering both…' : 'Render both pipelines' }}
      </button>
    </section>

    <section class="v2c-results">
      <article v-for="side in [left, right]" :key="side.pipeline" class="v2c-side">
        <header>
          <h4>{{ side.label }}</h4>
          <span v-if="side.elapsed" class="v2c-elapsed">{{ side.elapsed }}s</span>
        </header>

        <div class="v2c-image">
          <img v-if="side.imageUrl" :src="side.imageUrl" :alt="side.label" />
          <div v-else-if="side.loading" class="v2c-loading">
            <span class="v2c-spinner" />
            <span>{{ side.stage || 'working' }}…</span>
          </div>
          <div v-else-if="side.error" class="v2c-error">
            <p>{{ side.error }}</p>
            <p v-if="side.errorRetryable === false" class="v2c-error-hint">
              Not retryable — this needs a different photo, not another attempt.
            </p>
          </div>
          <div v-else class="v2c-empty">No render yet</div>
        </div>

        <dl v-if="side.pipeline === 'v2' && side.imageUrl" class="v2c-metrics">
          <div>
            <dt>Outside-socket</dt>
            <dd :class="`v2c-verdict-${(side.metrics.outsideVerdict || '').toLowerCase()}`">
              {{ side.metrics.outsideVerdict || '—' }}
            </dd>
          </div>
          <div>
            <dt>Residual chroma</dt>
            <dd>{{ side.metrics.residualChromaPct?.toFixed(3) ?? '—' }}%</dd>
          </div>
          <div>
            <dt>Mask</dt>
            <dd>
              {{ side.metrics.maskCached ? 'cached' : fmtMs(side.metrics.maskDurationMs) }}
              <template v-if="side.metrics.maskAttempts && side.metrics.maskAttempts > 1">
                ({{ side.metrics.maskAttempts }} tries)
              </template>
            </dd>
          </div>
          <div>
            <dt>Composite</dt>
            <dd>{{ fmtMs(side.metrics.compositeDurationMs) }}</dd>
          </div>
        </dl>

        <p v-if="side.metrics.blobCountWarning" class="v2c-warn">
          <strong>Socket mismatch:</strong> {{ side.metrics.blobCountWarning }}
          <br />
          This is the signature of an invented socket — worth inspecting closely.
        </p>

        <p v-if="side.pipeline === 'v2' && side.metrics.outsideChangePct !== undefined" class="v2c-raw">
          Raw outside-change {{ side.metrics.outsideChangePct.toFixed(3) }}% — measured on
          the model's raw output at a coarse grid, not on the delivered image. 2–3% is
          normal and passes; trust the verdict above.
        </p>
      </article>
    </section>

    <section class="v2c-panel">
      <h3>3. Verdict</h3>
      <input v-model="pendingNote" class="v2c-note" placeholder="What differed? (optional)" />
      <div class="v2c-verdict-buttons">
        <button @click="recordVerdict('v1')">v1 better</button>
        <button @click="recordVerdict('tie')">No clear winner</button>
        <button @click="recordVerdict('v2')">v2 better</button>
      </div>

      <div v-if="verdicts.length" class="v2c-tally">
        <p>
          <strong>{{ verdicts.length }}</strong> judged —
          v1 {{ tally.v1 }} · tie {{ tally.tie }} · v2 {{ tally.v2 }}
          <button class="v2c-link" @click="exportVerdicts">export</button>
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.v2c { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1rem; }

.v2c-notice {
  padding: .75rem 1rem;
  border-left: 3px solid var(--vp-c-brand-1);
  background: var(--vp-c-bg-soft);
  border-radius: 4px;
  font-size: .9rem;
}

.v2c-panel {
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.v2c-panel h3 { margin: 0 0 .75rem; font-size: 1rem; }

.v2c-drop {
  display: flex; flex-direction: column; align-items: center; gap: .75rem;
  padding: 1.5rem;
  border: 2px dashed var(--vp-c-divider);
  border-radius: 8px;
  transition: border-color .15s;
}
.v2c-drop.is-over { border-color: var(--vp-c-brand-1); }
.v2c-drop img { max-height: 220px; border-radius: 6px; }
.v2c-drop p { margin: 0; color: var(--vp-c-text-2); font-size: .9rem; }

.v2c-coverage { margin-top: 1rem; font-size: .875rem; }
.v2c-coverage summary { cursor: pointer; color: var(--vp-c-brand-1); }
.v2c-hint { color: var(--vp-c-text-2); font-size: .85rem; margin: .5rem 0; }
.v2c-case { display: flex; gap: .5rem; align-items: flex-start; margin: .4rem 0; line-height: 1.4; }

.v2c-variants { display: flex; flex-wrap: wrap; gap: .5rem; }
.v2c-variant {
  padding: .4rem .75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  cursor: pointer;
  font-size: .875rem;
}
.v2c-variant.is-active { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }

.v2c-session {
  display: flex; align-items: center; flex-wrap: wrap; gap: .5rem;
  margin: .85rem 0; font-size: .85rem; color: var(--vp-c-text-2);
}
.v2c-session .v2c-hint { margin: 0; flex-basis: 100%; }

.v2c-link {
  background: none; border: none; padding: 0;
  color: var(--vp-c-brand-1); cursor: pointer;
  font-size: inherit; text-decoration: underline;
}

.v2c-run {
  width: 100%; padding: .65rem;
  border: none; border-radius: 6px;
  background: var(--vp-c-brand-1); color: #fff;
  font-weight: 600; cursor: pointer;
}
.v2c-run:disabled { opacity: .5; cursor: not-allowed; }

.v2c-results { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
@media (max-width: 820px) { .v2c-results { grid-template-columns: 1fr; } }

.v2c-side {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: .85rem;
  background: var(--vp-c-bg-soft);
}
.v2c-side header { display: flex; justify-content: space-between; align-items: baseline; }
.v2c-side h4 { margin: 0 0 .6rem; font-size: .95rem; }
.v2c-elapsed { font-size: .85rem; color: var(--vp-c-text-2); font-variant-numeric: tabular-nums; }

.v2c-image {
  min-height: 200px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 6px;
  background: var(--vp-c-bg);
}
.v2c-image img { width: 100%; border-radius: 6px; }

.v2c-loading { display: flex; flex-direction: column; align-items: center; gap: .6rem; color: var(--vp-c-text-2); font-size: .875rem; }
.v2c-spinner {
  width: 22px; height: 22px;
  border: 2px solid var(--vp-c-divider);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: v2c-spin .8s linear infinite;
}
@keyframes v2c-spin { to { transform: rotate(360deg); } }

.v2c-empty { color: var(--vp-c-text-3); font-size: .875rem; }
.v2c-error { padding: .75rem; color: var(--vp-c-danger-1); font-size: .85rem; text-align: center; }
.v2c-error-hint { color: var(--vp-c-text-2); margin-top: .4rem; }

.v2c-metrics {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: .5rem; margin: .75rem 0 0; font-size: .8rem;
}
.v2c-metrics dt { color: var(--vp-c-text-3); }
.v2c-metrics dd { margin: 0; font-variant-numeric: tabular-nums; }
.v2c-verdict-pass { color: var(--vp-c-success-1, #3dd68c); font-weight: 600; }
.v2c-verdict-review { color: var(--vp-c-warning-1, #d97706); font-weight: 600; }
.v2c-verdict-fail { color: var(--vp-c-danger-1); font-weight: 600; }

.v2c-warn {
  margin: .75rem 0 0; padding: .5rem .65rem;
  border-left: 3px solid var(--vp-c-warning-1, #d97706);
  background: var(--vp-c-bg); border-radius: 4px;
  font-size: .8rem; line-height: 1.45;
}

.v2c-raw { margin: .6rem 0 0; font-size: .75rem; color: var(--vp-c-text-3); line-height: 1.45; }

.v2c-note {
  width: 100%; padding: .5rem;
  border: 1px solid var(--vp-c-divider); border-radius: 6px;
  background: var(--vp-c-bg); margin-bottom: .6rem;
}
.v2c-verdict-buttons { display: flex; gap: .5rem; }
.v2c-verdict-buttons button {
  flex: 1; padding: .5rem;
  border: 1px solid var(--vp-c-divider); border-radius: 6px;
  background: var(--vp-c-bg); cursor: pointer; font-size: .875rem;
}
.v2c-verdict-buttons button:hover { border-color: var(--vp-c-brand-1); }
.v2c-tally { margin-top: .75rem; font-size: .875rem; }
.v2c-tally p { margin: 0; display: flex; gap: .5rem; align-items: center; }
</style>
