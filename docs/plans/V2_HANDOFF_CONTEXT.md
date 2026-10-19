# v2 two-pass flow — full context for picking up the pass-2 fix

**Written:** 2026-08-14
**For:** whoever is fixing the pass-2 prompt and reference images
**Assumes:** you helped plan this flow but have not worked in the code

The suspected fault is in **pass 2** — the prompt it sends and the reference images it sends
with it. That is backend work. This document explains the whole system anyway, because to
confirm a pass-2 fix you have to read the debug panel on the comparison site, and to do that you
need to know what the three repos are and how a change reaches the page.

Read §1 and §2, then jump to §5 (where the fix goes) and §7 (how to verify it).

---

## 1. What the two pipelines are

**v1 (live, on customer sites today).** One model call. Send the customer photo plus the wheel's
studio references, ask for the wheels swapped. Whatever comes back is the render.

**v2 (two-pass, under test).** Two model calls with code in between:

| | what it does | output |
|---|---|---|
| **Pass 1 — mask** | paint flat magenta over each rim | photo with magenta sockets |
| *code* | repair, composite, gate | rejects a bad mask before spending pass 2 |
| **Pass 2 — fill** | build the new wheel into each socket, from the studio references | the filled image |
| *code* | paste back only socket pixels | final render |
| **Audit** | a second model judges the result | pass/fail verdict |

The point of two passes is that pass 2 is told exactly where it may paint. Code then keeps only
the pixels inside the sockets, so the rest of the photo is byte-identical by construction rather
than by asking the model nicely.

**The mask is cached per session**, keyed on session ID alone. First render pays for pass 1
(~14s); every later finish on the same photo skips it. That is why a cold render is ~45s and the
next two are ~30s — and why a cache-hit render legitimately has **no `mask` entry** in the debug
output. Not a bug.

---

## 2. The three repos

```
CarConfig/            Go backend. The pipeline itself.       <-- your fix is here
car-config-embed/     The embeddable widget (Solid.js).      <-- probably no change needed
embed-compare/        The comparison/test page.              <-- probably no change needed
```

Local paths on the machine this was built on: `D:\Work\Claude\CarConfig`,
`D:\Work\Claude\car-config-embed`, `D:\Work\Claude\embed-compare`.

**GitHub remotes** — note the page repo has two, and this matters (§6):

| repo | remote | notes |
|---|---|---|
| CarConfig | `XIX3D/CarConfig` | backend |
| car-config-embed | `XIX3D/car-config-embed` | public; releases serve the widget files |
| embed-compare | `origin` → `XIX3D/embed-compare` | old, public, **not** deployed |
| | `proj` → `xix3D-proj/embed-compare2` | **private, this is what Vercel deploys** |

**The comparison site:** `embed-compare2.vercel.app`. Two buttons side by side — CURRENT (live
v1) on the left, NEW (two-pass v2) on the right — plus a wheel picker and a debug sidebar.

---

## 3. How a render flows, end to end

```
tester clicks NEW on the page
  └─ v2 widget bundle  (car-config-embed/src/index-v2.tsx)
      └─ POST /api/v1/render/v2/chain/stream          <-- SSE, one event per stage
          └─ CarConfig: render_v2_handler.go
              ├─ product + variant lookup             (which wheel, which finish)
              ├─ LoadReferences(...)                  <-- studio images fetched here
              ├─ TwoPassService.BuildMask(...)        pass 1  (or cache hit)
              ├─ TwoPassService.Fill(...)             pass 2  <-- THE SUSPECT
              └─ audit
```

Everything the debug panel shows arrives on that one SSE stream. The page never makes a second
request for it.

---

## 4. Reading the debug panel (do this first)

Open `embed-compare2.vercel.app`, pick a wheel, click **NEW**. The right-hand sidebar fills in
live. Each render is a card; click a card header to fold it.

Each card shows the pipeline as stages, with **inputs** and **output** stated separately:

```
PASS 1 — mask
  INPUTS   ▶ prompt text  4k chars
           1. customer_photo  425 KB
  OUTPUT   [the magenta socket image]
  GATE     sockets found  2

PASS 2 — fill
  INPUTS   ▶ prompt text  9k chars
           1. masked_car                    3151 KB
           2. reference_finish_authority    1913 KB   ← sole authority on finish
           3. reference_shape_only           137 KB
  OUTPUT   The finished render

AUDIT — post-check                          PASSED
```

Four things to know:

- **Image numbers are load-bearing.** The prompt refers to images by position (`1_MASKED_CAR`,
  `2_WHEEL_34`). If they are reordered, the prompt's finish-authority clause lands on the wrong
  picture. The numbering in the panel is the send order.
- **`reference_finish_authority` is highlighted.** It is the *only* image allowed to determine
  finish. If it names the wrong variant, that alone explains a wrong-colour render.
- **Click a prompt to expand it, then "open full screen"** for a readable view. Prompts are JSON,
  so the viewer renders them as structured sections; there is a raw/structured toggle.
- **`ref images` in the header is ON by default.** That fetches the actual reference bytes
  (~20 MB per render) so you can *see* which picture was sent, not just its filename. Turn it off
  if the payload is a problem.

**Do this before changing anything.** The panel will usually tell you whether the wrong image was
sent (your bug is in reference selection) or the right image was sent and ignored (your bug is in
the prompt). Those have different fixes and the panel is what separates them.

---

## 5. Where the pass-2 fix goes

All paths relative to `CarConfig/`.

### 5a. The prompt

**`internal/platform/adapters/compositor/prompts.go`**

- `FillPrompt(in FillPromptInput, key Key) string` — line ~129. Pass 2's prompt.
- `MaskPrompt(key Key) string` — line ~47. Pass 1's, for reference.

Both build a Go `map[string]any` and return `json.MarshalIndent` of it. So the prompt is a
structured document of named rules, not prose — add or change a key and it appears in the debug
panel automatically.

Two things in there that are easy to break:

1. **Image numbering is computed, not hardcoded.** `FillPrompt` numbers images from the ones
   actually being sent (`n++` as each optional reference is added), because finish authority must
   land on an image that exists. If you change how references are assembled (5b), the prompt's
   numbering follows automatically — but only if you keep using the same counter.
2. **`FillPromptInput`** (line ~103) carries `HasFrontView` / `HasCentreCap`. These must agree
   with what is actually sent, or the prompt describes images that are not there.

Tests: `prompts_test.go`.

### 5b. Which reference images get sent

**`internal/platform/adapters/gemini/twopass_service.go`**

- `LoadReferences(variantImage *string, productPaths []string, retries int)` — line ~543. Builds
  the ordered list. **Variant image first** (the finish authority), then product-level images as
  shape-only references.
- `Fill(...)` — line ~340. Sends `[masked_car, ...references]` in that exact order, and records
  the capture the debug panel displays (line ~370).

**⚠ The trap worth knowing about.** In `LoadReferences`, a reference that fails to download is
**skipped with only a log line** (line ~570):

```go
log.Printf("[TwoPass] reference image %q unavailable: %v", p, err)
continue
```

If the *variant* image is the one that fails, the product image silently slides into position 0
— and position 0 *is* finish authority. The render then comes back in the wrong finish with no
error anywhere. This is a strong candidate for what you are chasing, and the debug panel now
makes it visible: check whether `reference_finish_authority` names the variant you picked.

- `resolveAssetPath(...)` — line ~595. The products table is inconsistent: some rows hold a full
  `https://storage.googleapis.com/...` URL, others hold a bare bucket-relative path. This
  normalises them. A bare path loaded verbatim hits the container filesystem and fails — that is
  how the first real v2 render failed. The panel shows `→ resolved:` when the two differ.

### 5c. The handler that wires it together

**`internal/platform/adapters/http/render_v2_handler.go`** — line ~246:

```go
variantImage = variant.ReferenceImage
references, err := h.twoPass.LoadReferences(variantImage, product.ReferenceImagePaths, 3)
...
HasFrontView: len(references) > 1,
```

If a wheel has no variant-level reference image in the database, `variantImage` is nil and the
product image becomes finish authority — same bad outcome as the silent-skip above, but from a
data problem rather than a network one. Worth checking the DB row for any wheel that renders
wrong, before changing code.

### 5d. Audit

Rejections are a separate model judging the finished render. The comparison build asks for
`debug=true`, which makes the backend send `audit_failed_debug` **with the rejected image
attached**, so the page shows the render anyway and reports the rejection in the sidebar. That is
deliberate: production hides a rejected render, which is right for a customer and wrong when the
question is whether the audit is calibrated correctly.

---

## 6. Pushing and deploying

### Backend (CarConfig)

Normal deploy process — unchanged by any of this. Nothing on the comparison page needs updating
when the backend changes; the page reads whatever the backend sends on the next render.

### Widget (car-config-embed) — only if you change widget code

Two artifacts are built from two entry points:

| entry | artifact | tag | who loads it |
|---|---|---|---|
| `src/index.tsx` | `car-config-embed.iife.js` | `latest` | **every customer site** |
| `src/index-v2.tsx` | `car-config-embed-v2.iife.js` | `v2-test` | the comparison page only |

**The isolation rule.** v2 code must never reach the `latest` bundle. This is enforced
structurally: `latest` is built from an entry point that does not import any v2 module, so no
minifier decision can leak it. A build-time flag was tried first and **failed** — v2 loading
strings shipped to production because the check only looked for six specific markers.

`.github/workflows/release.yml` builds on a tag push and runs three checks before publishing:
`check-pipeline-resolution.mjs`, `check-loading-stages.mjs`, `check-bundle-isolation.mjs`. Only
the `v2-test` tag builds the v2 artifact.

To publish a widget change:

```bash
node tools/build-v2test.mjs      # builds BOTH, verifies each direction
git push origin feat/two-pass-v2
git tag -f v2-test <sha> && git push -f origin v2-test    # CI publishes the asset
```

⚠ **A v2-only change often produces a byte-identical file size.** Do not confirm a publish by
size — grep the downloaded asset for something you changed.

### The page (embed-compare)

Static site, no build step (`vercel.json` sets `buildCommand: null`, `outputDirectory: public`).
Vercel deploys on push.

⚠ **Push to `proj`, not `origin`:**

```bash
git push proj HEAD:main     # xix3D-proj/embed-compare2  <-- the one Vercel deploys
```

`origin` is the older public `XIX3D/embed-compare` and is **not** deployed. Both are kept in sync
here only to avoid confusion; if you push only to `origin`, nothing happens on the site and there
is no error to tell you so.

⚠ **Commit email decides GitHub attribution — not the name field.** The Vercel integration is
owned by `xix3D-proj`, and commits authored as `aamir@xix3d.com` are attributed to a *different*
GitHub account, which blocks the deploy. Both repos have a local override:

```bash
git config user.email    # must be contact@xix3D.com
```

This cost hours to find because `git log` shows the *name* (`xix3D-proj`), which looked correct
the whole time. If a push does not deploy, check the email first.

The page loads the widget from the **public** `XIX3D/car-config-embed` releases
(`public/index.html` lines 115–116), so the private page repo does not need access to a private
widget.

---

## 7. Verifying a fix

1. Deploy the backend change.
2. Open `embed-compare2.vercel.app`, pick the wheel that was rendering wrong.
3. Click **NEW**. Watch the sidebar.
4. In the **PASS 2 — fill** block, confirm:
   - `reference_finish_authority` names the variant you picked;
   - the thumbnail beside it is the right wheel in the right finish;
   - image order is `masked_car`, then references;
   - the prompt (open full screen) says what you intended.
5. Compare the render against the CURRENT button on the same wheel.

Both sides run the same session, so the second and third finishes reuse the cached mask — if you
are specifically testing pass 1, reload to force a cold render.

**Testing does not bill anyone.** Renders from this site are logged non-billable against a test
manufacturer (ID 8, "Test Co") with `CountsTowardUsage: false`. HRE and Velos accounts are not
charged. The tokens in use are Velos (manufacturer 9); HRE's wheels are currently inactive.

---

## 8. Still outstanding on the backend

Two asks from `V2_DEBUG_PROMPT_CAPTURE.md` that were **not** implemented, both of which would
help with exactly this investigation:

1. **No mask image on a gate failure.** `Composited` is only built inside `if res.Verdict.Passed`
   (`twopass_service.go`, stage 3), so a `mask_gate_failed` render carries no picture — the case
   where seeing it would help most. The panel says so explicitly rather than showing nothing.
2. **`res.Mask` (raw pass-1 model output) is built but never shipped.** Having both it and
   `Composited` would separate "the model painted sockets in the wrong place" from "our
   compositing placed them wrongly". Suggested field name: `raw_mask_b64`.

Also known, lower priority:

- `Verdict.Blobs` is not cached, so a cache-hit render cannot report a socket count. The panel
  says "not reported (cached)" rather than "0 sockets", which would read as "no wheels found".
- Vehicle detection is uncached, ~6s per render. Helps v1 too.

---

## 9. Reference docs

In `car-config-embed/docs/plans/`:

- `TWO_PASS_EMBED_PLAN.md` — the pipeline design
- `TWO_PASS_BACKEND_HANDOFF.md` — the original backend spec for the two-pass endpoint
- `V2_DEBUG_PROMPT_CAPTURE.md` — the model-input capture ask (mostly implemented)
- `V2_TEST_ORIGIN_WHITELIST.md` — origin whitelisting so preview limits do not block testing

In `CarConfig/docs/`:

- `TWO_PASS_V2_STATUS.md` — backend status; §3 documents the `passes` capture format the debug
  panel consumes

---

## 10. Where things live, at a glance

**Backend — your fix**

| file | what |
|---|---|
| `compositor/prompts.go` | both prompts (`FillPrompt` ~129, `MaskPrompt` ~47) |
| `gemini/twopass_service.go` | `LoadReferences` ~543, `Fill` ~340, `resolveAssetPath` ~595 |
| `http/render_v2_handler.go` | orchestration, reference loading ~246 |

**Widget — unlikely to need changes**

| file | what |
|---|---|
| `src/index-v2.tsx` | v2 entry point; the isolation boundary |
| `src/utils/api-v2.ts` | v2 render client, SSE handling, debug flags |
| `tools/build-v2test.mjs` | builds and verifies both artifacts |

**Page — unlikely to need changes**

| file | what |
|---|---|
| `public/timing.js` | the whole debug sidebar and prompt viewer |
| `public/picker.js` | wheel thumbnail picker |
| `public/index.html` | the two buttons; widget `<script>` tags |
