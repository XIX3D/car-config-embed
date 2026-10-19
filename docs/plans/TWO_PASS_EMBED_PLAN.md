# Two-Pass Render Pipeline — Embed Plan (car-config-embed)

**Repo:** `car-config-embed` (this one)
**Written:** 2026-08-11
**Revised:** 2026-08-12 — backend is complete; estimates replaced with measured numbers
**Status:** backend done and live; embed work in progress
**Companion:** `docs/plans/TWO_PASS_BACKEND_HANDOFF.md` — the original request to the
CarConfig side. Their reply is `D:\Work\Claude\CarConfig\docs\TWO_PASS_V2_STATUS.md`, and
where the two disagree, **the status doc wins** — it reports real renders.
Nothing in this plan touches the backend.

---

## What changed on 2026-08-12

The backend shipped and measured itself. Two of the estimates in the original handoff were
wrong and the corrections matter:

**Cost is ~48% higher, not near-parity.** The handoff quoted 1.02 image calls per delivered
render. That came from a *campaign*, where one photo gets many finishes. Measured against
real production traffic — 2.08 renders per session, 49.3% of sessions rendering more than
once, over 8,968 renders / 90 days — v2 costs **~1.48 calls per delivered render** against
v1's 1.00. This is a business decision to take deliberately, not a rounding error.

**Latency: first render as predicted, cached render worse.**

| | Estimated | Measured |
|---|---|---|
| First render on a photo | ~46s | **45.2s** |
| Subsequent finish (cached mask) | ~23s | **30.6s** |

The gap is because vehicle detection is **not** cached — `VehicleCacheRepository` is wired
to a no-op stub, so every render re-runs a 5–7s text call even on an identical photo in the
same session. Fixing it takes cached renders from ~30s to ~24s **and speeds up v1 equally**.
That is a v1 win sitting in a v2 document and is worth raising separately.

The Gemini audit costs ~5s — 11–18% of every render, cold or cached. That is the price of
the post-check filter, and it is higher than anyone assumed going in.

**Already correct on our side:** `createSession()` returns `crypto.randomUUID()` and
`index.tsx` sets it once per page load, so we already send the stable UUID `X-Session-ID`
the mask cache keys on. No work needed — but see §2.6, because it is now load-bearing.

---

## 0. The constraint that shapes everything

Every live customer site loads the widget from a single URL:

```html
<script src="https://github.com/XIX3D/car-config-embed/releases/download/latest/car-config-embed.iife.js"></script>
```

That is the `latest` release tag. **Pushing to `latest` updates every embedded site
worldwide on their next page load** — no customer opt-in, no version pinning, no cache
barrier beyond GitHub's CDN. That is how the product is designed to work and we are not
changing it.

So the isolation requirement is absolute: **v2 testing must never be reachable from the
`latest` bundle.**

The good news is the mechanism already exists. `.github/workflows/release.yml` builds and
publishes on any `v*` tag, and there is already a `staging` tag alongside `latest`. A
`v2-test` tag publishes to an entirely separate release URL that only the test site knows
about. Live embeds resolve a different file and cannot reach v2 even by accident.

---

## 1. One codebase, two distributions

Two independent decisions, and it matters that they are separated.

### Bundle: one codebase, both pipelines

v1 and v2 differ by which endpoint is called and which SSE stages are handled — on the
order of 200 lines. Forking the repo means every unrelated fix gets made twice and the two
drift apart. So: one branch (`feat/two-pass-v2`), both pipelines present, merged back to
`main` once proven.

### Distribution: two release tags, different defaults and different allowlists

| Tag | Default pipeline | v2 reachable at runtime? | Who loads it |
|---|---|---|---|
| `latest` | v1 | **No — not in the allowlist** | Every live customer site |
| `v2-test` | v2 | Yes, both selectable | The test site only |

The critical detail: in the `latest` build, v2 is **not merely defaulted off — it is not
in the allowlist at all**, so the switch is dead code. If v2 were reachable from `latest`
by a query parameter, a customer could stumble into it or we could ship a default-flip by
accident.

This is enforced at build time:

```ts
// src/config/pipeline.ts
const DEFAULT = import.meta.env.VITE_PIPELINE_DEFAULT ?? 'v1'
const ALLOWED = (import.meta.env.VITE_PIPELINE_ALLOWED ?? 'v1').split(',')

export type Pipeline = 'v1' | 'v2'

export const resolvePipeline = (requested?: string | null): Pipeline => {
  if (requested && ALLOWED.includes(requested)) return requested as Pipeline
  return DEFAULT as Pipeline
}
```

`latest` builds with `VITE_PIPELINE_ALLOWED=v1`. `v2-test` builds with
`VITE_PIPELINE_ALLOWED=v1,v2` and `VITE_PIPELINE_DEFAULT=v2`. Terser drops the unreachable
branch from the production bundle.

### Long term

Once v2 is proven, the switch should move to **per-embed-token on the backend**, so
customers migrate individually rather than everyone flipping at once. That is phase 2 and
is noted in the backend handoff. The build-time flag is deliberately a testing mechanism,
not the permanent migration mechanism.

---

## 2. Work items

### 2.1 Pipeline config module — `src/config/pipeline.ts` (new)

As above. Reads the build-time default and allowlist; exposes `resolvePipeline()`. The
runtime override source on the test build is a query parameter (`?pipeline=v2`) plus a
programmatic option on `AvaCar.open()`, so the A/B page can drive both without reloading.

### 2.2 API client — `src/utils/api.ts`

Add `renderStreamV2()` alongside the existing `renderStream()`, posting to
`/api/v1/render/v2/chain/stream`. The request shape is **identical** to v1's, so this is
largely a copy with a different path.

v2 lives on a **separate host** (`carconfig-api-v2test-*.run.app`), not a different path on
the production API. So the v2 client is constructed with its own base URL. This strengthens
the isolation story considerably: the `latest` bundle cannot reach v2 because it does not
know the *host*, not merely the path.

`processSSEStream()` already ignores unknown events, so it needs only additive changes —
new cases for `mask_started`, `mask_complete`, `fill_started`, `composite_complete`,
forwarded to new optional handlers on `RenderStreamEvents`. Because every handler is
optional, **v1 call sites need no changes at all**, which is what keeps the `latest`
bundle's behaviour unchanged where it matters.

Preserve the existing quota and email-gate parsing paths untouched — `parseQuotaBody`,
`parseEmailGateBody` and `parseEmailGateEvent` are shared by both pipelines, and v2 sits
behind the same middleware chain so both behave identically.

**v2 constraints, enforced server-side:** one product per request, wheels only. A
multi-product selection or a wrap gets a clear `error` event. The comparison page must
constrain selection to a single wheel.

### 2.3 Types — `src/types.ts`

Extend `RenderStreamEvents` with the four optional v2 handlers, and add interfaces for
their payloads:

```ts
interface MaskStartedData { cached: boolean }

interface MaskCompleteData {
  gate_passed: boolean
  attempts: number
  duration_ms: number
  cached: boolean
  sockets: number
  blob_count_warning?: string
}

interface CompositeCompleteData {
  outside_change_pct: number
  residual_chroma_pct: number
  duration_ms: number
  outside_verdict: 'PASS' | 'REVIEW' | 'FAIL'
  socket_px: number
  written_px: number
}
```

**`blob_count_warning`** appears only when the socket count disagrees with the number of
wheels intake saw. It does not block the render, but it is the signature of an *invented
socket* — the chroma-collision failure mode that is otherwise invisible to every gate.
Surface it prominently in the debug view; it is the highest-value diagnostic v2 emits.

### 2.6 Session ID is now load-bearing — do not "clean up"

`X-Session-ID` keys the mask cache. Our current handling is already correct, but the
failure mode if it ever regresses is **silent**: renders still succeed, they just each pay
full price (~45s instead of ~30s, and 2 model calls instead of 1).

The backend replaces any non-UUID value with a fresh UUID per request, so a malformed ID
does not error — it just defeats the cache. Worth a comment in `session.ts` so nobody
refactors it without knowing the cost.

### 2.4 Loading experience — `src/constants.ts`, `src/components/Modal/LoadingView.tsx`

Today `LOADING_STEPS` is a hardcoded ~18s script of four steps. A v2 first render measures
**45.2s** and a cached one **30.6s**, so the existing script finishes and then sits there
for most of the wait.

Two changes:

- A `LOADING_STEPS_V2` script whose stages match the real pipeline, weighted by the
  measured timings rather than guessed:

  | Stage | Cold | Cached |
  |---|---|---|
  | Analysing vehicle | 5.3s | 7.3s |
  | Isolating wheels (mask) | 14.4s | *skipped* |
  | Applying finish (fill) | 20.5s | 17.1s |
  | Compositing + quality check | 5.9s | 5.5s |

- Drive stage transitions from **real SSE events** rather than timers. The backend emits
  per-stage events precisely so the embed can stop guessing; timers stay only as a fallback
  between events.

The asymmetry is worth surfacing: `mask_started` with `cached: true` means the slow half is
being skipped entirely, so the 2nd and 3rd finishes a user tries are noticeably quicker
than the first. The copy should not imply a uniform wait.

### 2.5 Result view — metrics display, test build only

`ResultView.tsx` gains an optional metrics strip, gated behind the debug/test build. On
`latest` this is dead code.

**Display `outside_verdict`, not `outside_change_pct`.** This is a trap and it is worth
being explicit about. `outside_change_pct` reads ~2.767% on a render that **passes**,
because it is measured on the model's *raw output* at a coarse grid — not on the delivered
image. Independently measured on the final composited output, actual outside-socket change
is **0.067%**, and that residue is our own disclaimer overlay, drawn after compositing.

Showing the raw percentage on a comparison page would make a correct render look like a
2.7% failure. Show the `PASS`/`REVIEW`/`FAIL` verdict as the headline, with the raw numbers
available underneath and labelled as raw-output measurements.

---

## 3. The test site

A separate VitePress page in this repo's existing docs site, which already hosts the
render playground and its QC tooling — reusing that is much cheaper than standing up a
separate property, and the site already deploys to Cloudflare via `wrangler.toml`.

### `docs/v2-comparison.md` + `docs/.vitepress/theme/components/V2Comparison.vue`

The page loads the widget from the **`v2-test` release URL**, not `latest`:

```
https://github.com/XIX3D/car-config-embed/releases/download/v2-test/car-config-embed.iife.js
```

What it does:

- Upload one photo, pick **one** wheel and finish (v2 rejects multi-product).
- Fire **both pipelines against the same inputs** and show results side by side.
- Display per-pipeline timings, and for v2 the gate verdict (see §2.5 on which number).
- Let a reviewer mark which side is better, storing the verdict locally so a session
  produces a tally rather than an impression.

The A/B verdict capture matters more than it sounds. The failure modes v2 targets —
structure drift toward the generic five-spoke, colour migration into calipers, deleted
signature features, photo-dependent flakiness — are obvious side by side and nearly
invisible in isolation.

### This page is also v2's real-photo coverage

Worth stating plainly, because it changes how the page should be used. The backend's own
§9 records that v2 is **verified on one photo** — a pink Porsche 911, across 6 renders. The
compositor has 80+ unit tests, but against synthetic fixtures.

So this page is not merely a quality comparison; it is the first real-world coverage the
pipeline gets. The cases most likely to break it, and therefore most worth uploading
deliberately rather than testing whatever is handy:

- **Dark or low-light scenes** — the failure mode that broke the absolute luminance gate.
- **Small wheels in large frames** — a known soft-render limit (~350px wheel in a 2528px
  frame spends the model's detail budget on tarmac).
- **Partially occluded wheels** — the far-side crescent that the convex-hull guard exists
  to protect, and the case most likely to trip `blob_count_warning`.
- **Strongly coloured original wheels** — the colour-migration case v2 is built to fix.
- **Green-heavy backgrounds** (foliage, hedges) — should be safe now the key is magenta,
  but this is exactly the collision the key change was made to avoid, so it is worth
  confirming rather than assuming.

### Endpoint and test data

```
VITE_API_URL_V2=https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app
```

Test renders are non-billable — logged with `counts_toward_usage=false` against
manufacturer 8 (Test Co), verified in production data. Known-good test products:

| Product | Variants |
|---|---|
| **559** | 22 (Brushed Oxford Gold), 23 (Firecracker Black), 24 (Polished Classic Bronze), 25 (Zeno Polished Carbon Red) |

Avoid product **556** — its reference image 404s in GCS, so it fails on v1 too.

### Error handling — three distinct shapes

The comparison page and the modal both need these distinguished, because two of them must
not offer a retry:

| Error | Retryable | Treatment |
|---|---|---|
| `model_refused` | **no** | The model declined. Request bytes are identical next time — the reference measured one combination refusing 12 consecutive times. Never auto-retry; say the photo or prompt needs to change. |
| `render_failed` | yes | Genuine transport/API failure. Retry is fine. |
| `mask_gate_failed` | **no** | Pass 1 could not produce a usable mask. Verdict is session-cached, so retrying the same photo returns instantly without spending money — but it will never succeed. Prompt for a different photo, and surface `reasons[]`. |

Getting this wrong is the specific mistake the backend doc calls out: a retry loop
disguising a hard refusal as a network problem.

### Access

Add it to the VitePress nav under the existing playground entries. If the comparison page
should not be publicly discoverable, omit it from `config.ts` nav and reach it by direct
URL — the docs site is public, so treat the page as unlisted rather than secured.

---

## 4. Release workflow

`.github/workflows/release.yml` currently builds one artifact for any `v*` tag. It needs to
select the pipeline env by tag:

- Tag `v2-test` → `VITE_PIPELINE_DEFAULT=v2`, `VITE_PIPELINE_ALLOWED=v1,v2`
- Every other tag, including `latest` → `VITE_PIPELINE_DEFAULT=v1`,
  `VITE_PIPELINE_ALLOWED=v1`

**Default to v1-only on any unrecognised tag.** If the tag-matching logic is ever wrong,
the failure mode must be "v2 unavailable", never "v2 shipped to production".

Worth adding a CI assertion that greps the built `latest` artifact for the v2 endpoint
path and fails the build if present. Cheap, and it turns the guarantee from a convention
into a check.

---

## 5. Sequencing

The backend endpoint is live, so nothing is blocked. Order is by risk, not dependency.

**Safety mechanism — do these first:**
1. `src/config/pipeline.ts` and the build-time flag plumbing
2. Release workflow changes and the `v2-test` tag path
3. CI assertion that the `latest` artifact contains no v2 code
4. The comparison page shell, driven by v1 on both sides as a harness test

**Then the v2 integration:**
5. `renderStreamV2()` against the live endpoint
6. v2 SSE event handling, error shapes, metrics display
7. Loading stages driven by real events, weighted by measured timings
8. A/B evaluation against the photo classes in §3

Items 1–3 come first deliberately: they are what makes it impossible for v2 to reach
`latest`. Landing them before any v2 code exists means there is never a window where a
mistake could leak.

---

## 6. Open questions

- **Cost** — ~1.48 model calls per delivered render against v1's 1.00, a ~48% increase in
  image-model spend at real traffic ratios. This is a business call and should be made
  explicitly rather than discovered on an invoice.
- **Latency tolerance** — still deferred to testing, now with real numbers: **45.2s** first
  render, **30.6s** subsequent. If that proves unacceptable, the options are: pre-warm the
  mask on upload while the user is still picking a finish (hides ~14s of the cold path
  behind browsing time), or fix the uncached vehicle detection (~6s off *every* render,
  and it helps v1 too).
- **Which failure modes to score in A/B** — worth agreeing a rubric before evaluating,
  drawn from the documented v1 failures: structure drift toward the generic five-spoke,
  deleted signature features, colour migration into calipers, photo-dependent flakiness.
- **Uncached vehicle detection** — a v1 win sitting in the v2 document. Worth raising with
  the backend independently of whether v2 ever ships.

## 7. Out of scope

- Wraps. v2 is wheels-only; wraps stay on v1 permanently as far as this plan is concerned.
- Any backend change — see `TWO_PASS_BACKEND_HANDOFF.md`.
- Per-customer pipeline selection. Phase 2, backend-side, once v2 is proven.
- Changing how `latest` is distributed or how customers embed the widget.
