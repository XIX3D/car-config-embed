# Two-Pass Render Pipeline — Backend Handoff (CarConfig)

**For:** the CarConfig (Go backend) agent
**From:** the car-config-embed side
**Written:** 2026-08-11
**Status:** proposal, not started

This document specifies the backend work required to run the two-pass wheel render
pipeline alongside the existing single-pass one. **No work in this document should be
performed in the `car-config-embed` repo** — that side is covered by
`docs/plans/TWO_PASS_EMBED_PLAN.md` in that repo.

The source of truth for *why* the two-pass design works is
`D:\Work\Claude\wheel-prompt-generator\render-tests\WHEEL_AI_SYSTEM.md`. Read it before
implementing. This document covers only what changes inside CarConfig.

---

## 0. What is being added, in one paragraph

Today `/api/v1/render/*` makes one NB2 image call: customer photo + wheel references +
text prompt → finished image. That call regenerates the customer's entire photograph,
so the sky, the tarmac and the bodywork all get subtly redrawn, and the old wheel is
still visible to the model so its shape and colour bleed into the result. The two-pass
pipeline replaces that with: one NB2 call that deletes the wheels and paints flat chroma
sockets, deterministic Go code that repairs and composites those sockets, a second NB2
call that fills the sockets from studio references only, and deterministic Go code that
pastes **only the socket pixels** back onto the original photo. Outside-socket change
goes from a measured 11–18% to 0.00%, guaranteed by construction rather than by prompt
wording.

**Scope: wheels only.** Wraps stay on the v1 path. The whole design is wheel-shaped
(chroma sockets over rims) and does not generalise to wraps.

---

## 1. The current path, for reference

Confirmed by reading the code, so the port has a fixed starting point.

`RenderChainSSE` in `internal/platform/adapters/http/render_handler.go:481`:

1. `h.detectVehicle(...)` → `gemini-2.5-flash`, JSON `{is_car, make, model, year, vehicle_type}`.
   Cached by SHA-256 of the image via `VehicleCacheRepository`. Returns `ErrNotACar` to
   block non-car uploads. **This is the pre-check and it must survive unchanged.**
2. `h.renderService.RenderCombined(...)` → `gemini-3.1-flash-image-preview` (NB2), one call
   with the car photo, the variant reference, the orthographic image and the centerlock
   image, plus the markdown prompt from `prompts/wheels*.md`.
3. `h.auditRender(...)` → `gemini-2.5-flash`, JSON `{passed, reason, confidence}`.
   **This is the post-check and it must also survive.**

Models are pinned in `internal/platform/adapters/gemini/client.go:16-17`. Both are already
the models the new pipeline expects — no model changes are needed anywhere.

---

## 2. Task 1 — Merge intake facts into the existing vehicle-detection call

**This is the cheapest win in the whole project and it costs zero additional API calls.**

The two-pass pipeline needs per-photo facts (`intake/intake.py` in the source repo). We
already make a `gemini-2.5-flash` call against the same image for vehicle detection. The
field sets do not overlap. Merge them.

### Change

In `internal/platform/adapters/gemini/vehicle_detection.go`, extend
`vehicleDetectionSystemInstruction` and `core.VehicleDetection` with:

| Field | Type | Purpose |
|---|---|---|
| `scene` | enum: `studio`, `outdoor_daylight`, `outdoor_low_light`, `indoor`, `other` | Feeds render config choices |
| `wheels_visible` | int | Sanity-checks the mask's blob count |
| `old_wheel_colour` | string | Colour-migration guard input |
| `old_wheel_desc` | string | Brief spoke style and condition |
| `caliper` | string | Caliper colour, or the exact string `none_visible` |
| `wheel_fraction` | float | Front wheel diameter as a fraction of image width |
| `difficulty` | enum: `low`, `medium`, `high` | Routing and telemetry |
| `difficulty_reason` | string | Telemetry |

### Non-negotiable prompt wording

Port the caliper instruction **verbatim** from `intake.py`, do not paraphrase:

> Do not guess a caliper colour: most cars have no distinctly painted caliper, and
> inventing one causes a downstream render defect, so answer 'none_visible' unless a
> painted caliper is plainly there.

The reason this matters is documented: hardcoding "no caliper" once deleted a GT3's
yellow PCCB calipers, and inventing one is its own defect. The prompt has to thread that
needle and the existing wording is the one that was tested.

### Cache interaction

`DetectVehicle` caches on SHA-256 of the image bytes. Adding fields changes the shape of
the cached value. **Version the cache** (a schema column or a key prefix) so old rows
missing the new fields are treated as misses rather than returning zero values that read
as "no caliper, difficulty low".

### Compatibility

`is_car` behaviour must not change. The v1 path keeps working with the extra fields
ignored. The embed's `vehicle_detected` SSE event keeps its current shape unless you
choose to extend it — the embed does not require the new fields.

---

## 3. Task 2 — Port the compositor to Go

**This is the hard part and the main risk in the project.**

The reference implementation is PowerShell + `System.Drawing` (Windows-only .NET GDI+).
It cannot ship in a Linux container. It must be reimplemented in Go against
`image` / `image/draw`.

### Files to port

| Source (PowerShell) | Stage | Go responsibility |
|---|---|---|
| `rohana3/hullfill.ps1` | 2 | Per-blob convex hull + 3px dilation of the chroma mask |
| `rohana3/composite.ps1 -Fill Green` | 3 | Paste flat chroma sockets onto the original photo |
| `reallife/maskscore.ps1` | 4 | Mask PASS/FAIL gate |
| `rohana3/composite2.ps1 -Fill Render` | 6 | Paste socket pixels back, with all four resampling fixes |
| `reallife/wheelstat.ps1` | 7 | Residual chroma, R−B and luminance inside the socket |
| `e2e-vossen/outsidediff.ps1` | 7 | Prove nothing outside the sockets changed |

### The four resampling fixes — do not lose these

`composite2.ps1` exists because a naive compositor produced the QC complaint *"the wheels
are being cut off clearly"*. None of those were render problems. A naive Go port using
`image/draw` will reintroduce every one of them, and the output will look plausible while
being wrong.

1. **Area-average downsampling, not nearest-neighbour.** Renders come back 1.16×–2.06×
   larger than the customer photo. Point-sampling a signal you are shrinking is aliasing
   by definition. Average over each destination pixel's source footprint.
2. **A real alpha ramp, not a binary edge.** Erode the socket by 1 to kill the chroma
   fringe, then take a box fraction over radius `Feather` and smoothstep it. **Default
   feather is 3**, measured not guessed: customer photos' own edges measure 2.52–3.16px,
   and at feather 2 our seam was still the sharpest edge in the frame on 26 of 26 wheels.
3. **Blend in linear light, not gamma-encoded sRGB.** Averaging bytes averages the
   *encoding*, not the light, and is always too dark. The loss scales with detail
   fineness (broad spokes −0.33%, fine mesh −6.48%) and eats the specular sparkle that
   makes brushed metal read as metal. Convert to linear, blend, convert back.
4. **Pixel-centre index mapping.** `int(x / ow * mw)` does not reproduce `x` even at equal
   size — on a 1320×745 mask over a 1320×745 photo, 82 columns and 42 rows sampled the
   neighbouring pixel. Use `(x + 0.5) * mw / ow`, which collapses to exactly `x` at equal
   size.

### The outside-socket guarantee

The alpha ramp must be built from the **eroded** socket so alpha is exactly 0 at and
beyond the true chroma boundary. This is what makes "no pixel outside the socket changes"
true by construction. It broke twice during development — an alpha ramp reaching 1px past
the socket (1,161 pixels) and the index-mapping bug (4 pixels) — and a 3-image spot check
nearly missed both.

One subtlety that caused a regression: **the ramp must blend toward the nearest pixel
outside the socket** (the tyre, which is what is actually behind the wheel), not toward
the original photo inside the socket. Inside the socket the original still shows the
customer's old wheel, so blending inward drags the old wheel's colour back along the seam.

### Testing requirement — golden images

Do not accept the port on inspection. Concretely:

1. Run the PowerShell scripts on a fixed set of inputs (the source repo has campaign
   outputs to use).
2. Commit those outputs as golden fixtures.
3. Make the Go port reproduce them within a tight per-pixel tolerance.
4. Port `verify_outside.ps1` as a Go test that proves 0.00% outside-socket change across
   the whole fixture set, not a sample.

A measurement that did not happen must never be indistinguishable from a measurement that
passed.

---

## 4. Task 3 — Use magenta, not green, as the chroma key

The source pipeline uses `#00FF00`. **Start on magenta instead.** This is an open item in
their own doc and the reasoning applies more strongly to us.

The risk: a real customer photo containing pixels the chroma detector mistakes for a
socket. A false blob over the 400px floor gets convex-hulled into a fake socket and filled
with wheel — and it is **invisible to every gate**, because compositing then declares those
pixels legitimately model-owned.

Measured across 19 real photos, the largest false blob was:

| Key colour | Largest false blob |
|---|---|
| Magenta | **129 px** |
| Green | 1,791 px |
| Blue | 43,435 px (a blue Subaru's own bodywork) |

Render quality is statistically insensitive to socket colour (measured at identical
geometry across 59 renders), so this is a pure collision-safety choice and costs about
five lines. Our input distribution — arbitrary customer photos from arbitrary customer
sites — is strictly worse than their three curated campaign cars, so we should take the
safer key from day one rather than migrating later.

Longer-term hardening: subtract key-coloured pixels present in the *source* upload before
detecting blobs.

---

## 5. Task 4 — The v2 render path

### Stage sequence

| # | Stage | Cost | Notes |
|---|---|---|---|
| 0 | Intake facts | 0 extra | Merged into existing detection call (Task 1) |
| 1 | Pass 1: mask | 1 NB2 call **per photo** | Prompt is byte-identical for every upload |
| 2 | Mask repair | code | Convex hull + 3px dilation |
| 3 | Mask composite | code | Chroma sockets onto original photo at original resolution |
| 4 | Mask gate | code | PASS/FAIL before any money is spent on pass 2 |
| 5 | Pass 2: fill | 1 NB2 call **per delivered render** | Masked car + studio reference in target finish |
| 6 | Render composite | code | Socket pixels pasted back |
| 7 | Render gate | code | Residual chroma, scene displacement, finish band |
| 8 | Existing Gemini audit | 1 text call | Unchanged, but see §7 |

### Mask caching — this is what makes the economics work

Stages 1–4 depend **only on the photograph**, never on which wheel or finish is going onto
it. One mask is reused by every wheel and every finish for that car. Rohana measured
**1.02 image calls per delivered render** across 468 renders.

Key the mask cache on **SHA-256 of the uploaded image** — the same key
`VehicleCacheRepository` already uses. Store the composited mask (original photo + chroma
sockets) plus its gate verdict. In the embed's usage pattern (upload once, browse several
finishes) this means the mask cost is paid once and every subsequent finish costs exactly
one call, the same as v1 today.

### Pass-1 prompt

Port `generic()` from `intake/mask.py`. It takes **no photo-specific facts** — identical
bytes for every upload. This was tested against a derived variant that included the car
and old-wheel colour: the generic prompt scored 9/10 on unseen photos and the derived one
changed nothing while slightly *worsening* chroma purity. Naming a colour anchors it.

### Pass-2 prompt

Port from `e2e-vossen/carrender.py`. Every clause is a defect that actually happened;
removing one brings its defect back. Port `assert_car_agnostic()` as a **build-time test**
— it fails the build if a manufacturer name appears in the prompt. Match on word
boundaries and multi-word phrases: an earlier version matched "ram" inside `FRAME_LOCK`
and flagged every prompt including the clean ones.

Three rules that are counter-intuitive and must not be "improved":

- **Never name a finish in words.** Costs roughly 15 degrees of hue. The effect is binary,
  not gradual. Finishes come from a reference image, always.
- **One finish reference beats two.** A single authority measured 8/8 against 3/8 for two.
  When a front view is sent it is explicitly stripped of finish authority and used for
  shape only.
- **Never assert something false to steer the model.** Telling it a reference showed "a
  different finish" when it did not made it actively avoid the target finish.

### Image config

- `imageSize`: 4K when the source photo is wider than 2200px, otherwise 2K, so the socket
  is always *down*sampled and therefore sharp.
- `aspectRatio`: **never send it on a customer photo.** Sending one reframes their
  photograph, which is a scene-lock violation.

### Refusals are not transport failures

A 200 response carrying no image part is the model declining. The request bytes are
identical next time, so retrying is pointless — one combination returned no image 12
consecutive times across two runs. **Stop after 2 refusals and report which kind of
failure it was.** A refusal needs a prompt change, not a retry. Do not let the retry loop
disguise a hard refusal as a network problem.

---

## 6. Task 5 — Gates, and the one that measures the wrong thing

### Mask gate (stage 4)

| Check | Fails when |
|---|---|
| Reframed | Output aspect ratio differs from source by more than 2% |
| No socket | Zero chroma blobs found |
| Chroma too small / too large | Under 0.15% or over 18% of the frame |
| Chroma tinted | Under 80% of the key colour is near-exact |
| Wheel visible inside socket | Largest **enclosed** non-key hole exceeds 6% of socket area |

That last check is topological and took two attempts to get right. The characteristic
pass-1 failure is a key-coloured *ring* at the rim lip with the original wheel still
inside it, which scores perfectly on percentage, purity and blob count. A ring **encloses**
non-key pixels; a legitimate partially-occluded crescent's concavity opens to the outside.
So flood-fill the non-key region from the image border — anything unreachable is a hole.
Measure the **largest** hole, not the total: anti-aliased specks around the rim added up to
3.5% and rejected three perfect masks.

One retry, then reject the photo.

### Render gate (stage 7)

| Check | Fails when |
|---|---|
| Residual chroma | More than 0.5% key colour left inside the socket |
| Scene displaced | More than 20% of the coarse grid outside the sockets changed |
| Finish lost | Hue or brightness too far from the wheel's own studio asset |

`outsidediff` is the catch-all: we know exactly which pixels were licensed to change, so
comparing everything else catches object insertion, reframing, relighting, body edits and
caliper repaints in one test. It exists because a Cayman render composited a large hero
wheel into the foreground that was never in the photo, and no gate at the time looked
outside the wheels at all.

### The luminance trap — read this before implementing the finish gate

Finish correctness uses two numbers taken inside the socket:

- **R−B** (mean red minus mean blue): catches hue substitution. **Absolute** tolerance,
  15 points from the wheel's own studio asset. Hue genuinely should not move with
  exposure, and 151/155 aluminium and 153/156 aircraft grey landed within 15 points across
  three very different photos.
- **Luminance**: catches what R−B is blind to. A satin black wheel rendered bright silver
  has R−B near zero, exactly like correct satin black.

**Luminance must not be gated in absolute terms.** The first ANRKY run did, and failed
every champagne render on one car and nothing at all on another. That was not a finish
defect — that car renders every wheel ~45 luminance points darker because *the scene is
darker*. The gate was measuring the photograph.

Their fix expresses each render's luminance as a share of the mean of **all three finishes
of that wheel on that car** (28/36 → 30/36, with 3 correct renders rescued and 1 genuine
failure caught that the absolute gate had passed).

**That fix is not directly available to us.** In the embed, a user renders one finish and
may never render another, so the sibling set does not exist at render time. Options, in
preference order:

1. **Precompute the expected luminance ratio per wheel offline** from the studio assets
   (which we have for all three finishes) and gate the single render against a
   scene-normalised expectation. Requires estimating scene exposure — the intake `scene`
   field and the photo's own statistics are the inputs.
2. Ship v2 with the R−B gate only and no luminance gate, accepting that a
   satin-black-rendered-as-silver defect passes to the Gemini audit to catch.
3. Gate luminance absolutely with a wide tolerance, accepting false failures on dark
   scenes.

**Recommendation: option 2 for the first test deployment**, with option 1 as follow-up
work once there is real data. Do not ship option 3 — it is the configuration already
measured to be wrong.

The general lesson, and it applies to any future gate: **do not gate on a quantity the
scene controls.**

---

## 7. Task 6 — Preserve both existing audit filters

Explicit requirement from the product side. Both stay.

### Pre-check (`is_car`) — unchanged, runs first

`DetectVehicle` returning `ErrNotACar` blocks the render before any image call is made.
This is untouched by the two-pass work and must keep running before pass 1. Since intake
facts merge into this same call (Task 1), the pre-check becomes strictly better value.

### Post-check (Gemini render audit) — unchanged, with one placement rule

`h.auditRender(...)` stays exactly as it is.

**It must run on the composited image, not on NB2's raw pass-2 output.** Auditing the raw
output would judge pixels that are about to be discarded by the compositor, and would miss
seam defects introduced by compositing.

The code gates and the Gemini audit check **different things** and neither replaces the
other:

- **Code gates** prove mechanical properties: no residual chroma, nothing outside the
  socket moved, finish within band. Free, instant, deterministic.
- **Gemini audit** judges perceptual quality: fender clipping, melted geometry,
  hallucinated text, implausible proportions.

Run code gates first (they cost nothing and catch mechanical failures before spending a
text call), then the audit.

---

## 8. Compute and infrastructure

**No server upgrade is required.** This was checked rather than assumed.

The compositing work is a convex hull over blobs, one area-average downsample, and an
alpha-ramped blend of the socket region — a handful of passes over a few megapixels. In Go
that is tens of milliseconds; budget 50–150ms including decode and encode. For scale, the
PowerShell implementation (interpreted, GDI+) re-composited an entire 468-render campaign
in ~90 seconds, or ~190ms per render, and that is the slow path.

Against the ~22.6s spent waiting on NB2, **compositing is under 1% of request time.**

Two things that do warrant attention:

1. **Memory, not CPU.** Decoded RGBA at 4K is ~34MB per image, and the compositor holds
   the original, the mask and the render simultaneously — roughly 100MB peak per
   concurrent render. At 10 concurrent renders that is ~1GB of transient allocation.
   **Check the container memory limit** and raise it if needed. Free buffers eagerly; do
   not hold decoded images across the NB2 network wait.
2. **The real cost is the extra NB2 call**, which is network wait and API spend, not
   server resource.

### Latency expectations

| Scenario | Estimate | Frequency |
|---|---|---|
| v1 today | ~23s | every render |
| v2, new photo (mask + gate + fill + composite) | **~46s** | first render on a photo |
| v2, cached mask (fill + composite) | **~23s** | every subsequent finish |
| v2, worst case (mask retry + fill retry) | ~90s | rare — 2.1% needed any retry |

First render roughly doubles; every render after that on the same photo matches v1. The
embed's usage pattern (upload once, browse finishes) puts most renders in the fast row.

**Please emit real timings per stage in the SSE debug payload** — the embed side needs
measured numbers to decide whether v2 is viable for live traffic.

---

## 9. API surface required by the embed

The embed needs v2 reachable **without disturbing v1 in any way**. Live customer sites
must continue to hit exactly the endpoints and response shapes they hit today.

### Preferred: a separate endpoint

```
POST /api/v1/render/v2/chain/stream
```

Same request shape as `/api/v1/render/chain/stream` (multipart: `vehicle_image`,
`products`, `manufacturer_id`, `fast_mode`, `debug`). A separate path means zero risk of
changing v1 behaviour, and it can be removed cleanly if v2 is abandoned.

An acceptable alternative is a `pipeline=v2` form field on the existing endpoint, but only
if the default with the field absent is provably identical to today's behaviour.

### SSE events

Keep all existing events (`started`, `vehicle_detected`, `progress`, `step_complete`,
`debug`, `complete`, `error`) with **unchanged shapes**. The embed's existing parser in
`src/utils/api.ts` handles these and will treat unknown events as ignorable.

Add these v2-only events so the embed can show honest progress across a ~46s first render:

| Event | Payload | Meaning |
|---|---|---|
| `mask_started` | `{cached: bool}` | Pass 1 beginning, or mask served from cache |
| `mask_complete` | `{gate_passed: bool, attempts: int, duration_ms: int}` | Mask gated |
| `fill_started` | `{}` | Pass 2 beginning |
| `composite_complete` | `{outside_change_pct: float, residual_chroma_pct: float, duration_ms: int}` | Code gates measured |

The `composite_complete` numbers are what the A/B comparison page will display — they are
the evidence that the guarantee held.

### Error shapes

Preserve the existing quota (429 with `retry_after_seconds`) and email-gate
(`error: email_required`) bodies exactly — the embed parses both. New v2 failure modes
should reuse the existing `error` event with a clear message, and distinguish **refusal**
from **transport failure** in the message so the embed does not present a hard refusal as
a retryable network error.

---

## 10. Suggested order of work

1. **Task 1 (intake merge)** — small, self-contained, zero call cost, useful even if
   everything else is abandoned.
2. **Task 2 (compositor port) with golden-image tests** — the long pole. Nothing else can
   be validated until this is trustworthy.
3. **Task 4 (v2 path) behind the new endpoint** — mask cache, both passes, wired to the
   compositor.
4. **Task 5 (gates)** — ship with R−B only, no absolute luminance gate.
5. **Task 6 (audit placement)** — confirm both filters run, audit on composited output.
6. **Telemetry** — per-stage timings and gate measurements in the debug payload.

## 11. Explicitly out of scope

- Wraps. v1 only.
- Changing anything on the `latest` embed path.
- Caliper preservation. Tested three ways, all fail structurally; the improvement path is
  better intake facts, not pixel preservation.
- Centre-cap lettering. Comes out mirrored or garbled on essentially every wheel and
  prompting does not fix it. The eventual fix is compositing cap artwork onto the detected
  ellipse in code — a follow-up, not part of this port.
- Per-embed-token pipeline selection. Phase 2, once v2 is proven. The test deployment uses
  a separate build instead (see the embed-side plan).

## 12. Known defects that ship with v2

Both are documented open items in the source system, not things this port introduces or
fixes. The product side has accepted them for the test deployment:

- **Brake calipers are re-rendered, not preserved.** Pass 2 never sees what was behind the
  wheel.
- **Centre-cap lettering is mirrored or garbled** on essentially every wheel.
- **Saturated finishes land under their target.** 141 of 156 radiant-copper renders sat
  more than 15 R−B points under reference (mean −27.9), while aluminium (−1.6) and
  aircraft grey (−3.4) were near perfect. A prompt colour anchor was tested and measured
  *worse*. The fix is a deterministic in-code correction toward the asset's measured R−B,
  acting on the wheel-metal cluster only — worth doing once the compositor is trusted,
  since the compositor already owns exactly the socket pixels.
