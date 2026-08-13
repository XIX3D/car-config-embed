# AVACAR Wheel AI: how the two-pass render system works

**For:** Aamir
**Written:** 2026-08-10
**Covers:** the pipeline that delivered the Rohana #3 campaign (468 renders) and is currently
running the ANRKY campaign.

---

## 0. The one-paragraph version

A customer uploads a photo of their car. We give back the *same photo* with a different set of
wheels on it. That takes **two AI image calls, not one**:

1. **Pass 1 (mask):** delete the wheels that are on the car and paint flat green holes where they
   were.
2. **Pass 2 (fill):** paint the new wheel into each green hole, working only from studio photos of
   that wheel. Pass 2 never sees the original wheels, so it cannot copy them.

Everything else is ordinary code, not AI: repairing the green holes, pasting the result back onto
the customer's photo, and measuring whether the render is correct. The rule the whole design
follows is **the model proposes, the code guarantees**.

### One naming correction before we go further

There is no "Nano 2.5 Flash". Two different models are in play and it is worth keeping them
straight:

| Job | Model | Nickname |
|---|---|---|
| Both image passes (mask, fill) | `gemini-3.1-flash-image-preview` | "Nano Banana 2" / NB2 |
| Reading facts off the photo (text) | `gemini-2.5-flash` | (no nickname) |

The "2.5" belongs to the text model that reads the photo. The image model is 3.1 Flash Image.
Gemini 3 **Pro** image (`nano_banana_pro`) was tested and rejected for this job: it is too
conservative for compositing edits and kept rebuilding the car's original wheel 4 times out of 4.

---

## 1. Why two passes instead of one

The obvious approach is one call: hand the model the photo and the wheel, say "swap them". We ran
that for months. It fails in ways that are not random, and all of them have the same root cause:
**the old wheel is still in the picture, so the model uses it.**

Measured failure modes from the single-pass era:

* **Structure contamination.** Every wheel drifts toward the same attractor, a generic mid-weight
  five-double-spoke with a plain rim. They arrive from different directions, so the corrections
  contradict each other: RFV2 drifted too thin (fix: force broad spokes), RFG7 drifted too thick
  (fix: force slender legs). No single template holds them all.
* **Deleted signature features.** RFX19 lost its signature pocket ring entirely.
* **Colour migration.** A GR86 with faded red original wheels produced hallucinated bright red
  brake calipers in all three shipped finishes, on a car that has no painted caliper at all.
* **Photo-dependent flakiness.** RFG11 kept its ten needle blades on a high-res studio Cayman and
  fused them away on a small side-lit phone shot, from the identical prompt.

Two passes removes the old wheel from pass 2's input entirely. Pass 2 is looking at a green ellipse
and a studio photo of the new wheel. It physically cannot copy what it cannot see. On the four
wheels where this was first tested (RFV2, RFG7, RFX19, RFG11) two-pass was right on the first
attempt every time.

---

## 2. The pipeline, stage by stage

| # | Stage | Who does it | API calls | What it guarantees |
|---|---|---|---|---|
| 0 | **Intake facts** | `gemini-2.5-flash` | 1 per **photo** | Caliper colour, old wheel colour, difficulty |
| 1 | **Pass 1: mask** | NB2 | 1 per **photo** | Old wheels replaced by flat green ellipses |
| 2 | **Mask repair** | code | 0 | Green covers the *whole* rim, not most of it |
| 3 | **Mask composite** | code | 0 | Mask = customer's own pixels + green holes |
| 4 | **Mask gate** | code | 0 | A bad mask is caught before any money is spent on pass 2 |
| 5 | **Pass 2: fill** | NB2 | 1 per **delivered render** | New wheel built into each socket |
| 6 | **Render composite** | code | 0 | 0.00% of the photo outside the sockets changes |
| 7 | **Render gate** | code | 0 | Wrong finish, leftover green or a displaced scene is caught |

The important line in that table is the **per photo / per render** distinction. Stages 0 to 4 depend
only on the photograph, never on which wheel or which finish is going onto it. So one mask is reused
by every wheel and every finish for that car. "Two renders" does not mean twice the cost; on the
Rohana #3 campaign it worked out at **1.02 API calls per delivered render**.

### Stage 0: intake facts (1 text call per photo)

`intake.py` asks Gemini 2.5 Flash to read the photo and return strict JSON: the car, the scene type,
how many wheels are visible, the old wheels' colour and style, the **caliper colour**, the wheel's
size as a fraction of the frame, and a difficulty score.

The prompt explicitly tells it *not* to guess a caliper colour, because most cars have no painted
caliper and inventing one is its own defect.

This stage exists for one reason: pass 2 never sees the original photo, which is exactly what
protects the customer's pixels, but it also means pass 2 cannot know what was *behind* the wheel.
Hardcoding "no caliper" once deleted a GT3's yellow PCCB calipers. The answer is not to hand the
photo back, it is to extract the two or three facts that are safe to state, once, and cache them.

### Stage 1: pass 1, the chroma mask (1 image call per photo)

The prompt (`intake/mask.py`, `generic()`) is **byte-identical for every upload**. No car name, no
colours, nothing per-customer. It asks NB2 to remove every visible alloy rim (spokes, hub, cap,
barrel, lip, and the brake components behind them) and replace each with a flat, uniform
`#00FF00` filled ellipse matching the position, diameter and perspective of the rim, with the inner
edge of the tyre as the hard boundary.

We tested whether feeding it the intake facts helped. It did not: a generic prompt scored 9/10 on
unseen photos, and adding the car and old-wheel colour changed nothing while slightly *worsening*
green purity. That is consistent with a rule we keep re-learning, that **naming a colour anchors
it**. So the cheaper design is also the better one.

### Stage 2: mask repair, in code (`hullfill.ps1`)

The model reliably puts the socket in the right place and reliably stops slightly short of the true
rim edge on some rows. Whatever the green misses survives into the final render as a defect on the
customer's own car: a notch bitten out of a rear wheel, a chrome lip cropped part-way round, a pink
outline that is the original wheel's lip showing through.

A wheel rim is convex, so the repair is the **per-blob convex hull**, plus a 3px outward dilation.
A pixel short leaves old wheel behind; a pixel long costs an invisible sliver of tyre that pass 2
simply renders as wheel, so the asymmetry is deliberate.

Guard: a partially occluded far-side wheel is a genuine crescent, and its hull would spill across
the bodywork hiding it. The hull is only accepted when it grows the blob by less than 1.30x.

### Stage 3: mask composite, in code (`composite.ps1 -Fill Green`)

The green sockets are pasted onto the **original photo at original resolution**. So the image handed
to pass 2 is the customer's own photograph with holes in it, not a re-rendered version of their
photograph. The green stays a hard flat fill with no feathering here: a soft green edge would hand
the model a gradient to interpret as geometry.

### Stage 4: mask gate, in code (`maskscore.ps1`)

Automatic PASS/FAIL before any money is spent on pass 2:

| Check | Fails when |
|---|---|
| Reframed | Output aspect ratio differs from the source by more than 2% |
| No socket | Zero green blobs found |
| Green too small / too large | Under 0.15% or over 18% of the frame |
| Green tinted | Under 80% of the green is near-exact `#00FF00` |
| Wheel visible inside socket | The largest **enclosed** non-green hole exceeds 6% of the green area |

That last check took two attempts to get right, and the reasoning is worth knowing because it
generalises. The characteristic pass-1 failure is a green *ring* at the rim lip with the original
wheel still sitting inside it, which scores perfectly on green percentage, purity and blob count.
The first fix measured how well each blob filled its bounding box, which also flagged a legitimate
far-side crescent. The real distinction is topological: a ring **encloses** a region of non-green,
a crescent's concavity opens to the outside. So we flood-fill the non-green from the image border,
and anything unreachable is a hole. And we measure the **largest** hole, not the total, because
anti-aliased specks around the rim added up to 3.5% and rejected three perfect masks.

One retry, then the photo is rejected. Sending a bad mask into pass 2 wastes a call and ships a
defect.

### Stage 5: pass 2, the socket fill (1 image call per delivered render)

Inputs: the masked car, plus the studio 3/4 render of the wheel **in the target finish**, plus
optionally a front view for structure. Section 5 covers the prompt rules in detail.

Image config note: `imageSize` is set to 4K when the source photo is wider than 2200px, otherwise
2K, so the socket is always *down*sampled and therefore sharp. `aspectRatio` is never sent on a
customer photo: sending one reframes their photograph, which is a scene-lock violation.

### Stage 6: render composite, in code (`composite2.ps1 -Fill Render`)

**This is the single most important stage and it contains no AI at all.**

"No pixel outside the green socket may change" was originally a prompt instruction, and the model
kept declining: measured 18% of the frame changed with `imageSize: 2K`, 11% with the field omitted.
Each pass regenerates the whole photo, so the sky, the tree line and the tarmac get redrawn slightly
every time. On a customer's own uploaded photo that is the one unacceptable failure.

Prompt wording could not fix it. The architecture could: take the model's output and paste **only
the socket region** back onto the original photo, at the original resolution. Outside-socket change
went 18% to 11% to **0.00%**, guaranteed by construction rather than by persuasion.

The compositor also carries four resampling fixes that came out of a QC complaint that "the wheels
are being cut off clearly". None of them were render problems:

1. **Area-average downsampling, not nearest-neighbour.** Renders come back 1.16x to 2.06x larger
   than the customer photo. Point-sampling a signal you are shrinking is aliasing by definition.
2. **A real alpha ramp**, not a binary edge. The old `-Feather` parameter eroded the socket and then
   copied pixels 1:1, so there was no blend anywhere. Default feather is 3, which came from
   measuring the photographs: the customer photos' own edges measure 2.52 to 3.16px, and at feather
   2 our seam was still the sharpest edge in the frame on 26 of 26 wheels.
3. **Blending in linear light**, not gamma-encoded sRGB. Averaging bytes averages the *encoding*,
   not the light, and is always too dark. The loss scaled with detail fineness (broad spokes
   -0.33%, fine mesh -6.48%), which was eating the specular sparkle that makes brushed metal read
   as metal.
4. **Pixel-centre index mapping.** `(int)(x / ow * mw)` does not reproduce `x` even when the two
   images are the same size: on a 1320x745 mask over a 1320x745 photo, 82 columns and 42 rows
   sampled the neighbouring pixel. Use `(x + 0.5) * mw / ow`, which collapses to exactly `x` at
   equal size.

One subtlety that caused a regression: the alpha ramp must blend toward the nearest pixel
**outside** the socket (the tyre, which is what is actually behind the wheel), not toward the
original photo inside the socket, because inside the socket the original still shows the customer's
old wheel. Blending inward drags the old wheel's colour back along the seam.

### Stage 7: render gate, in code

| Check | Instrument | Fails when |
|---|---|---|
| Residual green | `wheelstat.ps1` | More than 0.5% green left inside the socket |
| Scene displaced | `outsidediff.ps1` | More than 20% of the coarse grid outside the sockets changed |
| Finish lost | `finish_band()` | Hue or brightness too far from the wheel's own studio asset |

`outsidediff.ps1` is the catch-all: we know exactly which pixels were licensed to change, so
comparing everything else catches object insertion, reframing, relighting, body edits and caliper
repaints in one test. It exists because a Cayman render composited a large hero wheel into the
foreground that was never in the photo, and no gate at the time looked outside the wheels at all.

On FAIL the raw is discarded and one retry is made. On a second failure the render is logged as
failed rather than silently shipped.

---

## 3. What it costs

At roughly **$0.052 per NB2 image** (the platform's working figure):

| Campaign | Delivered | Pass 1 calls | Pass 2 calls | Calls per delivered render |
|---|---|---|---|---|
| Rohana #3 | 468 | 3 (one per car) | ~478 | **1.02** |
| ANRKY pilot | 36 | 0 (masks reused) | 49 | 1.36 |

Mean 3,499 tokens per pass-2 call, mean 22.6 seconds per call.

The ANRKY pilot's worse ratio is not a pipeline regression, it is a mis-set gate that failed correct
renders. See section 6.

Two things make the economics work:

* **Masks are per photo, and cached.** Trying a second wheel or a second finish on a car that
  already has an approved mask costs exactly one call.
* **Masks are keyed by photo identity.** Two of ANRKY's three campaign cars are byte-identical to
  Rohana's (sha256 and length both match), so their already-approved masks were reused and pass 1
  cost nothing. This is legitimate precisely because a mask depends only on the photo.

---

## 4. The design principle: model proposes, code guarantees

Every time we have tried to fix a pixel-level problem by writing a better prompt, we have lost. Every
time we have moved the guarantee into code, we have won. The pattern is consistent enough to be a
rule now.

| Problem | Asked the model | Moved into code | Result |
|---|---|---|---|
| Don't touch pixels outside the socket | "No pixel outside the green may change" | Paste only socket pixels back | 18% → 11% → **0.00%** |
| Fill the socket solidly | A COVERAGE clause insisting the ellipse be solid | Scanline fill, then convex hull | Fixed the photo that failed 4 re-rolls across 3 wordings |
| Hit the target finish saturation | A numeric colour anchor in the prompt | *(not yet done)* | Anchor measured **worse**: base error -30.9, anchored -32.2 |
| Legible centre cap lettering | An explicit legibility instruction | *(not yet done)* | Prompting does not fix it, on any wheel |

The two "not yet done" rows are the highest-value open items, and both are described in section 8.

---

## 5. The prompt rules that are load-bearing

Every clause in the pass-2 prompt is a defect that actually happened. None of them are decoration,
and removing one brings its defect back.

| Clause | The defect it exists to stop |
|---|---|
| `RULE_ZERO` (socket fill) | Sets the frame: the ellipses are empty, there is no previous wheel to reference and nothing to blend with |
| `NOTHING_MAY_BE_ADDED` | A Cayman render composited a large hero wheel into the foreground that was never in the photo |
| `FRAME_LOCK` | Pass 2 returned a close-up product shot with the car cropped away. "This is a photograph of a car that happens to contain wheels, not a photograph of a wheel" |
| `NO_COLOUR_MIGRATION` | Faded red original wheels produced hallucinated red calipers. **Scoped to the hardware only**: the blanket version broke when a car's old wheels were bronze and the target finish was copper, because it told the model to suppress the finish it was applying |
| `NO_BADGE_MIGRATION` | Rendering onto a Porsche produced a Porsche crest on the centre cap. Colour migrates from the old wheel; branding migrates from the *car* |
| `ZONE_COUNT` | The SP4 shipped with a polished lip on a gloss black monoblock, which is a product Vossen may not sell. A monoblock is one piece of metal: finish it and everything but the cap changes. Only a multi-piece wheel legitimately keeps separate finishes |
| `FINISH_IS_NOT_LIGHTING` | Gunmetal came back *brighter* than machine silver on a studio-lit car. A dark finish stays dark in a bright scene |
| `NO_COUNT_ASSERTED` | If a spoke count has not been measured, none is stated, and the model is told to copy the structure member for member. Asserting a guessed count is strictly worse than asserting none |

### Three counter-intuitive rules worth internalising

**Never name a finish in words.** Naming a finish colour in the prompt costs roughly 15 degrees of
hue. The effect is binary, not gradual. Finishes come from a reference image, always.

**One finish reference beats two.** Supplying a second finish reference measured 3/8 against 8/8
for a single authority. When the front view is sent, it is explicitly stripped of finish authority
and used for shape only. The cheaper catalogue is also the more accurate one.

**Never assert something false to steer the model.** Telling the model that a reference showed "a
different finish" when it did not made it actively avoid the target finish: asking for brushed
aluminium with a silver reference returned a bronze wheel. The clause now only says the image has
no finish authority, whatever it happens to show.

### The prompt is car-agnostic, and there is an assertion enforcing it

The pass-2 prompt bytes are identical for every customer upload. No car is named anywhere, including
in the negative clauses. We tested naming the marque on eight held-out photos chosen for loud badge
identity (Bugatti, two Fords, two BMWs, Land Rover, Toyota, Lamborghini): **8/8 clean in both arms**.
Naming the marque bought nothing, and negation is where image models are weakest, so naming a crest
is a plausible way to summon it.

`assert_car_agnostic()` fails the build if a manufacturer name appears in the prompt. It matches on
word boundaries and multi-word phrases, because an earlier version matched "ram" inside `FRAME_LOCK`
and flagged every prompt including the clean ones. A guard that cries wolf gets switched off, which
costs more than the guard was ever worth.

---

## 6. The gates, including one that was measuring the wrong thing

Finish correctness is gated on two numbers taken inside the socket:

* **R-B** (red channel mean minus blue channel mean): catches a hue substitution, for example
  aircraft grey coming back gold. Tolerance 15 points from the wheel's own studio asset.
* **Luminance**: catches what R-B is blind to. A satin black wheel rendered as bright silver has
  R-B near zero, exactly like correct satin black, and would sail through a hue gate.

Both targets are measured off **each wheel's own asset**, not set by hand.

### The luminance trap

The first ANRKY run gated luminance in absolute terms. It failed every champagne render and one
aluminium render on car 17178, and nothing at all on 17211. That is not a finish defect. Car 17178
renders every wheel roughly 45 luminance points darker than its studio asset because **the scene is
darker**. The gate was measuring the photograph.

The fix is to gate on something the scene cannot move. What is scene-invariant is the *relationship*
between finishes on the same wheel and the same car: satin black must come out markedly darker than
brushed aluminium in any light. So each render's luminance is expressed as a share of the mean
luminance of all three finishes of that same wheel on that same car, and compared against the same
share computed from the studio assets. A uniform darkening of the scene divides out; a satin black
rendered as silver does not.

Result: 28/36 under the absolute gate, **30/36** under the scene-relative gate, with 4 verdicts
flipping. Three were correct renders wrongly failed. One was a render the absolute gate had
**passed** and the relative gate correctly caught.

R-B keeps its absolute gate, because hue genuinely should not move with exposure, and the Rohana
data supports that: 151/155 aluminium and 153/156 aircraft grey landed within 15 points of their
assets across three very different photos.

The general lesson, and it applies to any future gate: **do not gate on a quantity the scene
controls.**

---

## 7. Results so far

**Rohana campaign #3** (`render-tests/rohana3/final.txt`):

```
renders            : 468
delivered PASS     : 468
first attempt      : 458/468 (97.9%)
needed a retry     : 10 (2.1%)
max residual green : 0.00%
max outside-socket : 0.00%
finish ordering    : 152/156 (97.4%)
```

**The re-delivery that cost nothing.** When QC reported that the wheels looked cut off, the defect
turned out to be four resampling bugs in the compositor, not the model (section 2, stage 6). Because
every raw model output is kept on disk, the entire campaign was re-composited and re-delivered for
about 90 seconds of local compute and **zero API spend**. Before re-rendering anything on a quality
complaint, check whether the defect is in the delivery path.

**The guarantee is fragile and is proven, not spot-checked.** "No pixel outside the socket changes"
broke twice while those fixes were being made: an alpha ramp reaching 1px past the socket (1,161
pixels) and the index-mapping bug (4 pixels). Both times a 3-image spot check nearly missed it.
`verify_outside.ps1` now proves it across the whole delivered set.

**ANRKY** is the first brand the pipeline has been pointed at that it was not built for, and it is
running today. Three findings from that port are worth flagging because they are data-quality
problems, not pipeline problems:

* ANRKY's front views **do not exist**. Every wheel's `orthographic_image_url` is the same URL as
  its `three_quarter_image_url`, and the files are byte-identical, while both status columns read
  "approved" on all 148 wheels. So ANRKY runs 3/4-only. Fortunately a paired A/B across 52 wheels
  had just shown 3/4-only to be statistically level with 3/4-plus-front on finish accuracy
  (mean absolute error 3.8 vs 4.3), so the constraint and the recommendation agree.
* `finishes_generated` reads 0 on all 148 wheels and is wrong: the per-finish renders all exist in
  the bucket and are genuinely different images. Trust the bucket, not the column.
* One car in the campaign's `car_set` is a dead URL, 404 under every prefix. The runner warns and
  skips rather than aborting a 148-wheel job, but the campaign is quietly configured for a car it
  cannot use.

---

## 8. Known limits and open items

**Brake calipers are re-rendered, not preserved.** Pass 2 never sees what was behind the wheel, so
the real caliper is gone. We tested preserving it three ways and all three fail, two of them
structurally: the model traces the caliper in the wrong place; a correct code-side detection still
fails because the caliper is only visible through the *old* wheel's spoke gaps, so the protected
shape gets cut by a spoke pattern that no longer exists; and a second saturated key inside the
socket contaminates the finish (a brushed aluminium request came back bronze). The improvement path
is better facts at intake, not pixel preservation.

**Centre cap lettering comes out mirrored or garbled** on essentially every wheel, even with an
explicit legibility instruction. Prompting does not fix this. The fix is to composite the cap
artwork onto the detected ellipse as a post-process, in code.

**Saturated finishes land under their target.** Scored against each wheel's own studio asset, 141 of
156 delivered radiant-copper renders sit more than 15 R-B points under their reference (mean -27.9,
worst -61.1), while aluminium (-1.6) and aircraft grey (-3.4) are near perfect. The error runs
toward neutral and scales with distance from it. A numeric colour anchor in the prompt was tested
and measured *worse*. Since the compositor already owns exactly the socket pixels, the fix is a
deterministic in-code correction toward the asset's measured R-B, acting on the wheel-metal cluster
only so it does not tint the disc and caliper.

**The chroma key should probably move from green to magenta.** The risk is a real customer photo
containing pixels the chroma detector mistakes for a socket: a false blob over the 400px floor gets
convex-hulled into a fake socket and filled with wheel, and it is invisible to every gate, because
compositing then declares those pixels legitimately model-owned. Over 19 real photos the largest
false blob was **magenta 129px, green 1791px, blue 43435px** (a blue Subaru's own bodywork). Render
quality itself is statistically insensitive to socket colour (measured at identical geometry across
59 renders), so this is a pure collision-safety choice and costs about 5 lines. The better long-term
fix is to subtract key-coloured pixels present in the *source* upload.

**Small wheels in large frames are soft.** When the wheel is only ~350px of a 2528px frame, asking
for the whole frame at once spends the model's detail budget on tarmac. Rendering the wheel region
at high resolution and compositing it back should beat it.

**Refusals are not transport failures.** A 200 response carrying no image part is the model
declining. The request bytes are identical next time, so a third and a ninth attempt fail too. One
wheel/finish/car combination returned no image 12 consecutive times across two runs. The retry loop
disguised a hard refusal as a network problem well enough that it was reported as one. The runner
now stops after 2 refusals and says which kind of failure it was; a refusal needs a prompt change,
not a retry.

**This is not yet inside CarConfig.** The two-pass pipeline lives in
`wheel-prompt-generator/render-tests/` as Python plus PowerShell, and it writes finished renders
into the platform's `campaign_car_renders` table as **pending**, for human approval. CarConfig (the
Go production renderer) still uses the older single-pass templates. Productionising means porting
stages 0 to 7 behind the Go service or calling out to this pipeline as a job. That is the main
outstanding engineering decision.

---

## 9. Where the code lives and how to run it

Everything is under `Desktop\GitHub\wheel-prompt-generator\render-tests\`.

| File | Stage | What it is |
|---|---|---|
| `intake/intake.py` | 0 | Vision read of the photo, strict JSON schema, cached per photo |
| `intake/mask.py` | 1 | The pass-1 prompt. `generic()` is the production one |
| `rohana3/hullfill.ps1` | 2 | Convex-hull repair of the green sockets |
| `rohana3/composite.ps1` | 3 | Pastes flat green sockets onto the original photo |
| `reallife/maskscore.ps1` | 4 | Automatic mask PASS/FAIL |
| `e2e-vossen/carrender.py` | 5 | The pass-2 prompt builder, plus the car-agnostic assertion |
| `e2e-vossen/pipeline.py` | 5 | The Gemini call itself, retry policy, refusal handling |
| `rohana3/composite2.ps1` | 6 | The socket paste-back, with all four resampling fixes |
| `reallife/wheelstat.ps1` | 7 | Residual green, R-B and luminance inside the socket |
| `e2e-vossen/outsidediff.ps1` | 7 | Proves nothing outside the sockets changed |
| `rohana3/verify_outside.ps1` | 7 | The same proof, run across a whole delivered campaign |
| `rohana3/rohana.py` | config | Rohana campaign config, shared machinery |
| `anrky/anrky.py` | config | ANRKY campaign config: what genuinely differs per brand |
| `anrky/run.py` | all | **The end-to-end runner. Read this first** |
| `rohana3/publish*.py` | delivery | Writes rows and images into the platform, status `pending` |

Running the ANRKY pilot end to end:

```powershell
cd C:\Users\Hammad\Desktop\GitHub\wheel-prompt-generator\render-tests\anrky
python run.py            # 6-wheel pilot
python run.py --all      # the full 148
```

`anrky/run.py` prints every stage and what it cost, and writes a per-render log to `run.json`. The
API key is read from `avacar-dashboard\.env` (`GEMINI_API_KEY`); the platform database credentials
come from `xix3d-platform\.env`.

Two environment traps that have each cost a run:

* PowerShell measurement scripts **must** be invoked with `-ExecutionPolicy Bypass`. Without it the
  refusal goes to stderr, stdout is empty, the caller parses nothing and falls through to its
  defaults, and reports a clean pass on a render it never measured.
* They must pipe through `Format-List`. An object with four or more properties prints as a table by
  default and the key/value parse silently returns nothing. A measurement that did not happen must
  never be indistinguishable from a measurement that passed, so the parser raises on empty output.

---

## 10. Glossary

| Term | Meaning |
|---|---|
| **NB2 / Nano Banana 2** | `gemini-3.1-flash-image-preview`, the image model doing both passes |
| **Pass 1 / mask** | The call that removes the old wheels and paints green sockets |
| **Pass 2 / fill** | The call that builds the new wheel into those sockets |
| **Chroma socket** | The flat `#00FF00` ellipse standing in for a removed rim |
| **Composite** | The code step that pastes socket pixels back onto the customer's original photo |
| **Gate** | An automatic PASS/FAIL measurement, no human and no AI involved |
| **R-B** | Mean red channel minus mean blue channel inside the socket. Our hue instrument |
| **Luminance share** | A render's brightness as a fraction of that wheel's own three-finish mean on that car. Scene-invariant |
| **Monoblock** | One piece of metal. The finish covers everything but the cap |
| **Multi-piece** | A face bolted to a separate barrel and lip, each of which can keep its own finish |
| **Finish authority** | The single reference image the model is told to take the finish from. There is always exactly one |
