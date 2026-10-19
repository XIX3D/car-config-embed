# Ask: push a wheel library to prod as a new manufacturer, for v2 render testing

**For:** whoever runs `importing.xix3d.com`
**From:** the v2 render-pipeline testing side
**Written:** 2026-08-24

---

## What we need, in one line

A campaign's wheels imported into the **prod Platform database as a new manufacturer**, with each
variant's **3/4 view** set as its reference image, so we can point the v2 render comparison site at
them.

We think you may already be able to do this — see §6. If so, the rest of this document is context
rather than instructions.

---

## 1. Why

The v2 (two-pass) render pipeline now sends **exactly one** wheel image to the model, and that one
image is authority on **both** the finish and the shape:

> `2_WHEEL_34` — "The finished wheel, 3/4 view. This is the ONLY authority on finish, and also
> the authority on depth and part boundaries."

Previously the work was split across up to three references. It was narrowed deliberately, but the
consequence is that **render quality is now bounded by the quality of a single file per variant**.

We are seeing accuracy vary *between finishes of the same wheel*, which is what you would expect
if the per-variant 3/4 photos are inconsistent — each is a different shot, and each is now solely
responsible for both properties.

So: we want to re-test with a library of 3/4 views produced by the new system, instead of the
current Velos assets. Swapping the library is the cleanest way to test whether the assets are the
problem or the pipeline is.

**This is a testing manufacturer, not a customer.** It never goes on a customer site.

---

## 2. What we have

A campaign on `importing.xix3d.com`, on the Platform (Supabase) database, holding the new 3/4
renders. We can identify the specific campaign — we just need it pushed to prod.

---

## 3. What the target needs to look like

Two columns matter, and only one of them is critical.

| what | column | why |
|---|---|---|
| **the 3/4 view** | `product_variants.reference_image` | **This is the finish authority.** The single image v2 sends. |
| fallback | `products.reference_image_paths` | used only when a variant has no image of its own |

Everything else about the row is ordinary.

**One behaviour to be aware of:** if a variant's `reference_image` is null, the backend falls back
to the product-level asset and treats *that* as finish authority. It is not an error — a
single-finish wheel legitimately has no variant image. But for our test it would silently mean the
wrong picture is the authority, so **every variant we want to test needs its own
`reference_image`**.

---

## 4. The API, if you are calling it directly

Base URL `https://api.platform.xix3d.com`. All routes require:

```
Authorization: Bearer <HRE_SYNC_API_KEY>
```

We have this key. These are the manufacturer-agnostic `/sync/*` routes added in the campaigns work
(R6) — the same handlers as the older `/sync/hre/*` paths, so nothing here is HRE-specific.

### 4a. Create the manufacturer

```http
POST /api/v1/sync/manufacturers
Content-Type: application/json

{ "name": "V2 Test Library", "slug": "v2testlib" }
```

```json
{ "manufacturer_id": 42, "slug": "v2testlib", "created": true }
```

**Idempotent** on company name: re-running returns the existing ID with `created: false`. Safe to
retry. It creates a synthetic user `manufacturer+<slug>@platform.xix3d.com` behind the scenes.

### 4b. Import the wheels

```http
POST /api/v1/sync/import
Content-Type: application/json

{
  "manufacturer_id": 42,
  "chunk_index": 0,
  "total_chunks": 4,
  "variants": [
    {
      "wheel_external_id":   "v2testlib-VXS-00",
      "wheel_name":          "VXS-00 1-Piece Monoblock",
      "series":              "VXS",
      "variant_external_id": "v2testlib-VXS-00-gloss-black",
      "variant_name":        "Gloss Black",
      "hex_color":           "#101010",
      "reference_image_url": "https://<supabase-public-url>/new_34_gloss_black.webp"
    }
  ]
}
```

Field reference (`HREVariantImport`):

| field | required | notes |
|---|---|---|
| `wheel_external_id` | yes | groups variants into one product |
| `wheel_name` | yes | |
| `series` | | |
| `variant_external_id` | yes | unique per finish |
| `variant_name` | yes | shown in the render UI as the finish name |
| `hex_color` | | |
| **`reference_image_url`** | **yes for our purposes** | **the 3/4 view — this becomes the finish authority** |
| `orthographic_image_url` | | not used by the v2 path |
| `centerlock_image_url` | | not used by the v2 path |
| `render_prompt` | | not used by the v2 path (see §7) |

**Images are re-hosted, not linked.** The API downloads each URL and copies it into GCS at
`products/<gcs_prefix>/<external_id>/reference.jpg`. So the Supabase URLs only need to be publicly
readable **at import time** — nothing depends on them afterwards. If they are private, we need
signed URLs or a temporary public window.

**Chunking** is supported via `chunk_index` / `total_chunks`, so a few hundred images can go in
batches. The response reports `created` / `updated` / `skipped` and a per-variant `errors` array,
so a partial failure is visible rather than silent.

**Category is set automatically.** Imported products are hardcoded `CategoryWheels`, which is
required — the v2 pipeline rejects any other category outright.

### 4c. Get an embed token per wheel

```http
GET /api/v1/sync/embed-token?external_id=v2testlib-VXS-00
```

```json
{
  "external_id": "v2testlib-VXS-00",
  "product_id": 1234,
  "product_name": "VXS-00 1-Piece Monoblock",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Creates the token if none exists**, so there is no separate provisioning step — one GET per
wheel. The JWT carries `manufacturer_id` and `wheel_id`.

We need `product_id`, `product_name` and `token` for each wheel. If it is easier for you to hand us
a list and let us fetch the tokens ourselves, that works too — we have the key.

---

## 5. What we do with it afterwards (no action needed from you)

The comparison site reads a static `wheels.json` of `{id, name, img, token}` per wheel. We build
that from the responses above and deploy it. No backend involvement.

---

## 6. The actual question for you

**Can `importing.xix3d.com` already do this?**

Our understanding is that the site drives imports into the Platform database per campaign. If it
can already push a campaign to prod under a chosen manufacturer, that is clearly better than us
hand-rolling §4 — it would handle the Supabase-to-URL plumbing, the chunking, and the retry
semantics that we would otherwise script badly.

Specifically:

1. **Is there an existing "push campaign to prod as manufacturer X" flow?** If yes, we would rather
   use it.
2. **Does it set `product_variants.reference_image` per variant** from the campaign's 3/4 renders?
   That is the one field that must be right (§3).
3. **Are the campaign's image URLs publicly readable at import time**, or do we need signed URLs?
4. **Which campaign holds the new 3/4 renders?** We can identify it on our side if easier, but you
   would know for certain.

---

## 7. Two things worth knowing, so nothing surprises anyone

**Billing: these renders cost the new manufacturer nothing.** The v2 handler logs every render as
non-billable against a fixed test manufacturer (ID 8, "Test Co") with `CountsTowardUsage: false`,
regardless of which manufacturer the wheel belongs to. So creating this manufacturer does not
create a metered account, and testing against it will not appear in anyone's usage.

**`render_prompt` will be ignored.** If the campaign carries per-wheel prompt text, the import will
store it but the v2 pipeline never reads it — v2 uses one generic prompt for every wheel. (v1 does
use it, so it is not wasted if these wheels are ever rendered through v1.) Not a problem, just
worth knowing so nobody spends effort on prompt text expecting it to take effect.

---

## 8. Summary of what we are asking for

1. The campaign pushed to the **prod Platform DB** as a new manufacturer (name of your choosing, or
   "V2 Test Library").
2. Each variant's **3/4 view in `product_variants.reference_image`**.
3. The resulting **manufacturer ID**, and either the wheel `external_id`s or the embed tokens.

Then we point the comparison site at them and re-run the test.

---

## Appendix: source references

All in the `CarConfig` repo.

| what | where |
|---|---|
| `/sync/*` route registration | `config/configurator.go:346` |
| API key middleware (`Bearer`) | `internal/platform/adapters/http/middleware/api_key.go:19` |
| Import request/variant shapes | `internal/platform/adapters/http/hre_sync_handler.go:51` |
| Variant reference image handling | `hre_sync_handler.go:291` |
| Product-level image handling | `hre_sync_handler.go:232` |
| Category hardcoded to wheels | `hre_sync_handler.go:355` |
| `CreateManufacturer` | `hre_sync_handler.go:648` |
| `GetEmbedToken` | `hre_sync_handler.go:554` |
| v2 rejects non-wheels | `internal/platform/adapters/http/render_v2_handler.go:224` |
| v2 non-billable logging | `render_v2_handler.go:477` |
| The pass-2 prompt and its image roles | `internal/platform/adapters/compositor/prompts.go:132` |

Companion docs, if more context is wanted: `V2_REALTIME_FLOW.md` (the whole render flow, and why
the single reference image matters) and `V2_HANDOFF_CONTEXT.md` (repos and deploy mechanics).
