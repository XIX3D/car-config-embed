# The realtime two-pass flow, click to render

**Written:** 2026-08-24
**Describes:** `CarConfig` branch `feat/two-pass-v2-backend` @ `d75c3ee`
**Purpose:** a shared picture of what actually happens when a tester clicks **PREVIEW ON YOUR CAR**
on the NEW (2-pass) side of `embed-compare2.vercel.app`, so the flow can be argued about
concretely.

Everything here is read off the current code, with file and line references so any claim can be
checked. Where a value looks arbitrary it usually is not — the prompt wording in particular was
arrived at by measurement, and §4 records what each clause is defending against.

> **Read this first if you have seen the earlier write-up.** Commit `d75c3ee` ("send one
> reference, fail loudly, label images from the prompt") changed pass 2 materially. **Pass 2 now
> receives exactly two images:** the masked car and one wheel reference. The front view and centre
> cap are no longer sent — `FillPrompt` still supports them, but `HasFrontView` is hardcoded
> `false` and `LoadReferences` returns a single image. Any discussion of "the three references"
> is now out of date. §5 has the detail.

---

## 1. The flow at a glance

```
click PREVIEW ON YOUR CAR  (NEW side)
  │
  ├─ widget opens the modal, user uploads a photo, picks finishes
  │
  └─ for EACH finish, queued one at a time:
       POST /api/v1/render/v2/chain/stream          (SSE, multipart body)
         │
         ├─ validation + vehicle detection          ~6s   → vehicle_detected
         ├─ product + variant lookup                      (which wheel, which finish)
         ├─ LoadReferences()                        ~1-3s  ← downloads the wheel's studio
         │                                                  photo from cloud storage.
         │                                                  ONE file now, not a list.
         │                                                  Network time, no model involved.
         │
         ├─ PASS 1  mask                            ~14s  → mask_started
         │    model call:  in  1 image  (customer photo)
         │                 out           photo with magenta sockets
         │    then IN CODE: repair → gate → composite
         │                                                → mask_complete
         │
         ├─ PASS 2  fill                            ~20s  → fill_started
         │    model call:  in  2 images (masked car + 3/4 wheel in target finish)
         │                 out           filled image
         │    then IN CODE: gates → composite socket pixels back
         │                                                → composite_complete
         │
         ├─ AUDIT                                   ~5s
         │    model call: judge the finished render
         │
         └─                                               → debug, then complete
```

Cold render ≈ **45s**. Second and third finishes ≈ **30s**, because pass 1 is cached (§6).

---

## 2. What crosses the wire

**Request** — `POST {API_URL_V2}/api/v1/render/v2/chain/stream`, multipart:

| field | value | notes |
|---|---|---|
| `vehicle_image` | the photo | as uploaded |
| `products` | `[{product_id, variant_id}]` | **exactly one**; v2 rejects more |
| `manufacturer_id` | 8 | Test Co — non-billable |
| `fast_mode` | `true` | |
| `debug` | `true` | unlocks the debug event |
| `debug_prompts` | `true` | ~6 KB: prompts + image metadata |
| `debug_images` | `true` by default on this page | ~20 MB: adds image bytes |

Header `X-Session-ID` carries the mask cache key. Built in `src/utils/api-v2.ts`.

**Response** — one SSE stream. Events in order: `started`, `vehicle_detected`, `mask_started`,
`mask_complete`, `fill_started`, `composite_complete`, `debug`, `complete`. Emitted from
`render_v2_handler.go` lines 179–430. The debug sidebar tees this stream and reads it without
touching what the widget consumes.

**v2 only accepts one wheel at a time.** Wraps and multi-product selections stay on v1
(`render_v2_handler.go:158`).

---

## 3. Pass by pass: inputs and outputs

### Pass 1 — mask

**Model call in:**

| # | image | what it is |
|---|---|---|
| 1 | `customer_photo` | the uploaded photo, untouched |

Prompt: `MaskPrompt()` — `compositor/prompts.go:50`.

**Important property: the pass-1 prompt takes no photo-specific facts.** The bytes are identical
for every upload. That was tested against a variant carrying the car and old-wheel colour; the
generic version scored 9/10 on unseen photos and the derived one slightly *worsened* chroma
purity. Naming a colour anchors it.

**Model call out:** the photo with each rim replaced by flat magenta.

**Then, in code (no model involved):**

1. **Repair** — per-blob convex hull closes edge bites the model left, then a small dilation.
2. **Gate** — run on the *repaired* mask, before any pass-2 spend. Checks blob count, chroma
   purity (≥80%), and aspect drift (>2% ⇒ the model reframed the photo, automatic fail).
3. **Composite** — paint the flat sockets onto the photo at working resolution.

Stage numbering in the source is 1, 2, 4, 3 — deliberately, so gating happens before compositing
and a bad mask costs nothing further.

**Final pass-1 output:** `mask.Composited` — the magenta-socket image. This is what the debug
panel shows under PASS 1 → OUTPUT, and it is byte-identical to image 1 of pass 2.

⚠ **On gate failure, no image is produced at all.** `Composited` is only built when the gate
passes, so the case where you most want to look is the case with nothing to see. Outstanding
backend ask.

### Pass 2 — fill

**Model call in** — exactly two images as of `d75c3ee`, and the order is load-bearing:

| # | role | what it is |
|---|---|---|
| 1 | `masked_car` | pass 1's output — the photo with empty magenta sockets |
| 2 | `reference_finish_authority` | the wheel, 3/4 view, **already in the target finish** |

Prompt: `FillPrompt()` — `compositor/prompts.go:132`.

**Two capabilities exist in the prompt but are not currently used.** `FillPrompt` still builds
`3_WHEEL_FRONT_STRUCTURE_ONLY` and `4_CENTRE_CAP` blocks when `HasFrontView` / `HasCentreCap` are
set, but the handler hardcodes `HasFrontView: false` (`render_v2_handler.go:337`) and never sets
`HasCentreCap`, and `LoadReferences` returns a single image. Restoring either means changing both
sides together — load the asset and set the flag from what was actually loaded. The handler
comment says exactly this.

Worth knowing for the discussion: the measurement that motivated dropping the front view was
**3/4-only mean error 3.00 against 3/4-plus-front 3.50 over 52 wheels**, with shape detection
perfect across 148. That is a small margin on a small sample and no confidence interval was
stated — suggestive rather than settled, and cheap to revisit since the prompt support is still
there.

**Model call out:** the filled image (plus whatever else the model decided to change).

**Then, in code:**

1. **Gates** on the *raw* model output against the mask — `outside_change_pct` (fail >8%) and
   aspect drift. Measured on the raw output at a coarse grid, not on what you are shown, so a few
   percent is normal on a good render.
2. **Composite back** — only socket pixels are pasted onto the **original** photo. Everything
   outside is byte-identical by construction, not by asking the model nicely.

### Audit

A separate model judges the finished render. On this page (`debug=true`) a rejection arrives as
`audit_failed_debug` **with the image attached**, so the page shows the render anyway and reports
the rejection in the sidebar. Production hides a rejected render — right for a customer, wrong
when the question is whether the audit is calibrated.

---

## 4. What the pass-2 prompt actually says

`FillPrompt` returns `json.MarshalIndent` of a Go map, so the prompt is a structured document of
named rules rather than prose. The debug panel parses and renders it as sections.

### The images block

The prompt carries an `images` map that names each slot and states what authority it has. **What
is sent today** is the first two entries:

```
1_MASKED_CAR      "The customer's photo with each rim removed and replaced by a flat
                   magenta ellipse. Each is an EMPTY SOCKET. Build the wheel into each
                   socket at exactly the position, diameter and perspective the magenta
                   occupies. No pixel outside the magenta may change."

2_WHEEL_34        "The finished wheel, 3/4 view. This is the ONLY authority on finish,
                   and also the authority on depth and part boundaries."
```

Built but **not currently reachable**, since the flags that gate them are off:

```
3_WHEEL_FRONT_    "The same wheel, front view. Use this image for SHAPE ONLY … Its finish,
STRUCTURE_ONLY     colour, tone and reflectivity carry NO authority … The finish comes
                   from image 2 alone."

4_CENTRE_CAP      "Authority on the cap ARTWORK only: its logo, lettering and ring
                   structure."
```

**Numbering is computed, not hardcoded.** `n++` increments per image actually sent, so
`finish_authority` always names an image that exists. Hardcoding "image 2" was safe only while the
3/4 view was always present and always second.

**The prompt is now the single source of truth for the payload.** `PromptImageRoles(prompt)`
(`prompts.go:370`) parses the `images` map back out and sorts by the numeric key prefix — JSON
object order does not survive a round trip, so the `<n>_` prefix is what recovers send order. An
unparseable key deliberately sorts *last*, so a malformed prompt shows up as an oddity at the end
rather than silently claiming position zero, which is the finish-authority slot.

`Fill` then asserts the two agree (`twopass_service.go:400`):

```go
roles := compositor.PromptImageRoles(prompt)
if len(roles) != len(images) { …fail… }
```

So an image sent but not described is now a hard failure instead of an unlabelled extra.

**The 3/4 reference already has the finish applied.** This is the crux of the design: the finish
is never described in words, only shown. That is measured — naming a finish costs roughly **15
degrees of hue**, and the effect is binary rather than gradual.

### The rule clauses, and the defect each one exists for

| clause | defends against |
|---|---|
| `RULE_ZERO` | treating the sockets as something to blend with rather than fill |
| `NOTHING_MAY_BE_ADDED` | an extra wheel or product shot appearing in frame |
| `FRAME_LOCK` | the model zooming in on the wheel — "a photograph of a car that happens to contain wheels, not a photograph of a wheel" |
| `NO_COLOUR_MIGRATION` | the old wheel's colour bleeding into the new finish. **Scoped to the hardware, not the frame** — a bronze old wheel with a copper target would otherwise suppress the target itself |
| `NO_BADGE_MIGRATION` | a Porsche crest on the centre cap. Actually happened. The car is deliberately **not named** — 8/8 clean both with and without, and naming a crest is a plausible way to summon it |
| `FINISH_IS_NOT_LIGHTING` | gunmetal coming back brighter than machine silver on a studio-lit car — the finish drifting to the bright attractor |
| `socket_discipline` | residual magenta, and spill past the tyre edge |
| `scene_lock` | body/background/ride-height drift, and cropping |
| `SPOKE_COUNT` | only asserted when **verified by measurement**; a wrong count is worse than none, because the model obeys it |
| `NO_COUNT_ASSERTED` | when unverified: "do not simplify it into a more conventional pattern" |

### Three rules that look improvable and must not be touched

From the file's own header comment:

1. **Never name a finish in words.** ~15 degrees of hue, binary effect.
2. **One finish reference beats two.** A single authority measured **8/8** against **3/8** for
   two. A front view, when sent, is explicitly stripped of finish authority.
3. **Never assert something false to steer the model.** Telling it a reference showed "a different
   finish" when it did not made it *actively avoid* the target finish. Asking for brushed
   aluminium with a silver image 3 returned a bronze wheel.

### One deliberate omission

There is **no numeric colour anchor**, and that is measured rather than forgotten. The defect is
real — 141 of 156 radiant-copper renders sat >15 R-B points under their reference (mean −27.9),
against aluminium −1.6 and aircraft grey −3.4. But the fix was built and tested: base mean error
−30.9 vs anchored −32.2, with individual pairs swinging 13 points the wrong way. It adds variance
without moving the mean.

The comment names the right fix instead: **do it in code.** The compositor already owns exactly
the socket pixels, so correcting toward the asset's measured R-B costs no API spend. It has to act
on the wheel-metal cluster only, since the socket also contains the caliper and disc.

---

## 5. Where the reference images come from

This is the part most worth agreeing on, because it is where the current suspected fault sits.

### The two database columns

| what | table.column | type |
|---|---|---|
| **Variant** image — the finish-specific 3/4 shot | `product_variants.reference_image` | single value, nullable |
| **Product** images — the base wheel's assets | `products.reference_image_paths` | jsonb array |

Read at `postgres/variant_repository.go:47` and `postgres/product_repository.go:56`.

Related columns that exist and are **not** used by this path: `orthographic_image`,
`centerlock_image`, `prompt_finish`, `prompt_override`, `render_prompt`.

### How the authority is chosen

`LoadReferences(variantImage, product.ReferenceImagePaths, 3)` — `gemini/twopass_service.go:598`,
called from `http/render_v2_handler.go:251`. As of `d75c3ee` it returns **exactly one** reference:

```
if variant.reference_image is set:
    authority = it                          ← fromVariant = true
else:
    authority = first non-empty products.reference_image_paths entry
                                            ← fromVariant = false

if authority == "":                 → error "no reference images available"
if download fails and fromVariant:  → error, REFUSES to substitute
if download fails and !fromVariant: → error "product reference unavailable"
```

**The product fallback is legitimate, not a bug.** A single-finish wheel has no variant-level
image, and its default asset *is* the target finish. What changed is that the fallback is now
chosen **explicitly up front** rather than arrived at by a failed download shuffling the list.

### Path resolution

`resolveAssetPath()` — `gemini/twopass_service.go:649`.

The products table is **inconsistent**: some rows hold a full
`https://storage.googleapis.com/<bucket>/…` URL, others only a bucket-relative object path like
`temp/0fe52d3f….png`. A bare path loaded verbatim hits the container filesystem and fails — which
is exactly how the first real v2 render failed, on a product whose sibling rows worked fine. The
debug panel shows `→ resolved:` whenever the stored and fetched paths differ.

### What used to go wrong here, and what it now does instead

Worth knowing because it shaped the current design, and because renders from before `d75c3ee`
may still be in people's screenshots.

**Then:** a failed download was logged and skipped (`log.Printf(...); continue`). If the *variant*
image was the one that failed, the product default slid into index 0 — and index 0 *is* finish
authority. The render came back in the default finish, reported success, and only a log line
recorded it.

**Now:** the authority is chosen before anything is downloaded, and a failed load of a
*variant-sourced* authority is **fatal** — it refuses to substitute another asset. A wrong-finish
render caused by a missing file has become a visible error instead of a silent success.

**Still worth checking in the data:** if `product_variants.reference_image` is null for a wheel you
expect to be finish-specific, the product asset becomes authority legitimately as far as the code
is concerned, and the render will be in whatever finish that asset happens to show. That is a data
question, not a code one.

**How to check from the panel:** open the render, look at PASS 2 → INPUTS, and confirm
`reference_finish_authority` names the variant you picked.

### The panel's labels are now trustworthy

Previously `role` was assigned by index position (`if i == 0 { role = "reference_finish_authority" }`),
not read from the prompt — so the label could be confidently wrong. It is now derived from
`PromptImageRoles()`, so the panel and the prompt cannot disagree. The role strings are treated as
a contract with the page, which highlights `reference_finish_authority` specifically
(`twopass_service.go:126`).

`HasFrontView` was likewise `len(references) > 1` — a count standing in for an identity, so any
second product asset made the prompt describe a front view it had never seen. It is now explicitly
`false` until both sides are changed together.

---

## 6. Caching and timing

**Key:** `X-Session-ID` **alone** — not the photo, not the wheel
(`compositor/maskcache.go:104`). **TTL:** 30 minutes idle.

The widget generates the session ID with `crypto.randomUUID()` at module scope
(`src/utils/session.ts`), so it is **fresh per page load** — a reload forces a cold render, which
is how you deliberately re-test pass 1.

Because the key ignores the photo, the mask follows the *session*, not the image. Fine for the
intended flow (one photo, several finishes) and worth knowing if you ever change photos
mid-session.

**The widget serialises renders.** The modal fires one request per selected finish simultaneously
— correct for v1, wrong for v2, because three concurrent requests would each miss the cache and
build their own mask: three full masks, three model calls. A promise queue in `src/index-v2.tsx:110`
makes the first render build the mask and the rest reuse it.

**A cache-hit render has no `mask` entry in `passes`.** No pass-1 call happened, so there is
nothing to report. The panel says "PASS 1 — SKIPPED (cache hit)" rather than omitting the stage.

Rough budget on a cold render: vehicle detect ~6s · references ~1-3s · pass 1 ~14s · pass 2 ~20s ·
audit ~5s.

---

## 7. The two challenges we are actually facing

These are the ones driving the current accuracy problem. Both are consequences of how v2 was
narrowed, and both are open questions rather than settled bugs.

### 7a. One image is doing two jobs

Pass 2 receives a single wheel reference, and the prompt asks that one image to be authority on
**both**:

- **finish** — "the ONLY authority on finish"
- **shape** — "also the authority on depth and part boundaries"

There is no separate finish reference any more. Before `d75c3ee` the intent was a division of
labour: the 3/4 view owned finish, an optional front view owned shape and was explicitly stripped
of finish authority. Today one asset carries both, so **the quality of a render is bounded by the
quality of that single file** — and studio assets vary. A 3/4 shot that is good at showing a
finish is not necessarily well-lit or square-on enough to show spoke geometry, and vice versa.

**The symptom being seen:** less accuracy *between finishes* on the same wheel. That is consistent
with this cause. Each finish variant is a different photo, shot under different conditions, and
each one is now solely responsible for both properties. Where two variants of one wheel have
inconsistent photography, the renders diverge in shape as well as colour — and shape should not
depend on which finish you picked.

**What makes this hard to just revert:**

- The measurement that motivated dropping the front view showed 3/4-only was *better*: mean error
  **3.00 vs 3.50** over 52 wheels. Small margin, small sample, no stated interval — but it points
  the wrong way for simply putting it back.
- The prompt already warns hard against inferring finish from a second image, because that failed
  badly: told image 3's finish "differs from the target", a model looking at a silver image 3
  concluded the target could not be silver, and returned bronze for a brushed-aluminium request.
- One finish reference measured **8/8** against **3/8** for two.

So the history says *two finish authorities are worse*. What has not been tested is **one finish
authority plus one shape-only reference where the shape asset is finish-neutral** — which is what
`3_WHEEL_FRONT_STRUCTURE_ONLY` was built for and what `HasFrontView: false` currently disables.
The prompt text for it already exists and is carefully worded.

**Options worth weighing:**

| option | cost | note |
|---|---|---|
| Re-enable the front view as shape-only | small — load the asset, set the flag from what loaded | the prompt support is already written; this is the cheapest experiment |
| Per-finish photography QA | data work, no code | if variance between variant photos is the real driver, this fixes it at source |
| Correct colour in code, not prompt | compositor work | already recommended in `prompts.go`; addresses finish accuracy without touching shape |
| Accept and measure | none | but "less accuracy between finishes" needs a number before it can be traded off |

### 7b. The per-wheel text prompt is gone

**Confirmed in code.** v1 builds a prompt per product and variant. v2 builds one generic prompt
for every wheel on the platform.

v1: `BuildPrompt(product, variant)` → `buildWheelsPrompt` (`config/services.go:118`, `:144`), which
draws on **four** per-wheel/per-variant inputs:

| input | column | what it does |
|---|---|---|
| `variant.PromptOverride` | `product_variants.prompt_override` | replaces the whole prompt for that variant |
| `product.RenderPrompt["text"]` | `products.render_prompt` | a custom prompt for that wheel |
| `variant.PromptFinish` | `product_variants.prompt_finish` | substituted as `{FINISH}` |
| `variant.HexColor` | `product_variants.hex_color` | substituted as `{HEX_COLOR}` |

Plus **template selection by wheel type** — `wheels_monoblock`, `wheels_chrome_bolts`,
`wheels_chrome_no_bolts`, `wheels_carbon_fiber_bolts`, `wheels_carbon_fiber_no_bolts`
(`config/services.go:176`), chosen from `products.wheel_type`.

v2: `FillPrompt(in, key)` uses **none of them**. `render_prompt`, `prompt_override`,
`prompt_finish` and `hex_color` are not referenced anywhere on the v2 path — verified by grep
across the handler, the two-pass service, and the prompt builder. What v2 does pass per-render is
much thinner:

- `Caliper` and `OldWheelColour` — from *vehicle detection*, not the wheel
- `DesignClass` — `product.Finish`, defaulting to `"unclassified"`
- `StructureDescription` — `product.Name`
- `SpokeCount` — only when verified by measurement, otherwise omitted

**Which is better is genuinely open, and the two designs disagree on principle.**

The case for v2's generic prompt is that it is deliberate, not an oversight. The header comment
records the finding: **naming a finish in words costs ~15 degrees of hue**, and the effect is
binary rather than gradual. `prompt_finish` and `hex_color` are exactly the kind of text v2 was
built to stop sending. A numeric colour anchor was then built and measured *worse* (−30.9 base vs
−32.2 anchored, individual pairs swinging 13 points the wrong way). So on **finish**, v1's
per-wheel text is not obviously an advantage and may be a liability.

The case for v1's per-wheel text is **everything that is not finish**. Wheel type genuinely
changes what the model needs to be told — a chrome wheel with exposed bolts and a carbon-fibre
wheel without them are different rendering problems, and v1 has separate templates for them.
`prompt_override` is also the escape hatch for a wheel that renders wrong for an idiosyncratic
reason, and v2 currently has no equivalent: if one wheel misbehaves, there is nothing to tune
short of changing the prompt for every wheel.

**A resolution that fits both findings:** keep finish out of the text (v2's measured position) but
restore per-wheel *structural* context — wheel-type template selection, and a per-product override
for genuine one-offs. That is not what either pipeline does today.

**Open questions to settle:**

- How many wheels actually have a non-empty `render_prompt` or `prompt_override`? If it is a
  handful, v1's per-wheel text was mostly unused and this matters less than it appears. One query.
- Do v1 and v2 diverge more on **unusual wheel types** (chrome, carbon fibre) than on monoblocks?
  If yes, that isolates the loss to template selection rather than to text generally.
- Is `product.WheelType` populated for the Velos catalogue? Template selection is worthless
  without it.

---

## 8. Other known weak points

### Fixed in `d75c3ee` — listed so old reports can be recognised

- **Silent reference fallback** — a failed variant download promoted the product default into
  finish authority and reported success. Now fatal.
- **Payload/prompt mismatch** — more images sent than described, the extra carrying no stated
  role. Now asserted equal.
- **Positional role labels** — the debug panel could label an image confidently while the prompt
  described something else. Now derived from the prompt.

### Still open

1. **No mask image on gate failure** (§3) — the case that most needs looking at shows nothing.
   `Composited` is only built when the gate passes.
2. **Raw pass-1 output (`res.Mask`) is never shipped** — so "the model painted sockets in the
   wrong place" cannot be separated from "our compositing placed them wrongly". Suggested field:
   `raw_mask_b64`.
3. **Colour accuracy on saturated finishes** — the measured −27.9 R-B gap on radiant copper (§4).
   The prompt-side fix was tried and measured worse; the code-side fix (correcting socket pixels
   toward the asset's measured R-B, on the wheel-metal cluster only) is unbuilt.
4. **`Verdict.Blobs` is not cached** — a cache-hit render cannot report a socket count. The panel
   says "not reported (cached)" rather than "0 sockets", which would read as "no wheels found".
5. **Vehicle detection is uncached** — ~6s on every render, including repeats of the same photo.
   Helps v1 too.

### Open questions worth settling in discussion

- **Was dropping the front view right?** 3.00 vs 3.50 mean error over 52 wheels is a thin margin
  with no stated interval. The prompt support is still in place, so re-enabling it is a two-line
  change on each side.
- **Is one reference enough for shape fidelity?** Shape detection measured perfect over 148
  wheels with the 3/4 alone, which argues yes — but that was measured on detection, not on
  render fidelity for unusual spoke geometry.
- **Does the audit's calibration hold** now that pass 2's inputs changed? Rejection rates before
  and after `d75c3ee` are not comparable.

---

## 9. Reading it live

Open `embed-compare2.vercel.app`, pick a wheel, click **PREVIEW ON YOUR CAR** on the NEW side. The
right-hand sidebar fills in live, one card per render:

- **Fold/unfold** a card by clicking its header; each render has its own accent colour.
- **PASS 1 / PASS 2 / AUDIT** blocks each show `INPUTS`, `OUTPUT`, and (pass 1) `GATE`.
- **Image numbers are the send order** — the prompt refers to images by position, so a reordering
  is a real bug and the number is how you spot it.
- **`reference_finish_authority` is highlighted** — the single most likely reference bug.
- **Click a prompt, then "open full screen"** for a readable structured view of the JSON, with a
  raw toggle.
- **`ref images` is ON by default** (~20 MB/render) so the actual pictures are visible, not just
  filenames.

---

## 10. File map

**Backend** (`CarConfig/`)

| file | what |
|---|---|
| `internal/platform/adapters/http/render_v2_handler.go` | the whole request: validation, lookup, orchestration, SSE |
| `internal/platform/adapters/gemini/twopass_service.go` | `BuildMask` (pass 1), `Fill` (pass 2), `LoadReferences`, `resolveAssetPath` |
| `internal/platform/adapters/compositor/prompts.go` | `MaskPrompt` :50, `FillPrompt` :132, `PromptImageRoles` :370 — the prompts and the role contract |
| `internal/platform/adapters/compositor/gates.go` | mask and composite gates, thresholds |
| `internal/platform/adapters/compositor/maskcache.go` | the session mask cache |
| `internal/platform/adapters/compositor/repair.go` | convex-hull repair between pass 1 and the gate |
| `internal/platform/adapters/postgres/variant_repository.go` | `product_variants.reference_image` |
| `internal/platform/adapters/postgres/product_repository.go` | `products.reference_image_paths` |
| `config/services.go` | **v1's** per-wheel prompt building — the thing v2 does not do (§7b) |
| `prompts/wheels*.md` | v1 wheel-type prompt templates (6 files); `internal/pkg/prompts/loader.go` loads them |

**Widget** (`car-config-embed/`)

| file | what |
|---|---|
| `src/index-v2.tsx` | v2 entry point, the render queue, debug flags |
| `src/utils/api-v2.ts` | request construction, SSE parsing, v2 error shapes |
| `src/utils/session.ts` | the session UUID that keys the mask cache |

**Page** (`embed-compare/`, deploys as `embed-compare2`)

| file | what |
|---|---|
| `public/timing.js` | the debug sidebar and prompt viewer |
| `public/index.html` | the two buttons; widget script tags |
| `public/picker.js` | wheel thumbnail picker |

Companion doc: `V2_HANDOFF_CONTEXT.md` — repos, deploy mechanics, and where to make changes.
