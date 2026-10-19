# Ask: whitelist the v2 comparison site's origin

**For:** the CarConfig (Go backend) side
**From:** the car-config-embed side
**Written:** 2026-08-13
**Size:** one line of YAML, plus a redeploy of the v2 test service

---

## The ask

Add one origin to `config/trusted_origins.yml`:

```yaml
trusted_origins:
  - https://avacar.docs.xix3d.com
  - https://embed-compare2.vercel.app   # <-- add this
```

Then redeploy the **v2 test service** (`carconfig-api-v2test`). Production does not need this
change — the site only calls the v2 test host for renders.

That is the whole ask. Everything below is why, and what to check.

---

## Why

`https://embed-compare2.vercel.app` is the v1-vs-v2 embed comparison page. It runs the real
widget — same modal, same flow — with the live `latest` bundle on one side and the `v2-test`
bundle on the other, so the two render pipelines can be judged by clicking through them rather
than by reading metrics.

Testing it means several renders in a row on one photo, which is exactly what the visitor
limits are built to stop. After a handful of finishes the site hits the email gate and the
render limiter, and testing stops for 30 minutes:

```
POST /api/v1/render/v2/chain/stream  ->  428 Precondition Required
```

`middleware.BypassRateLimit` already solves this. It matches the request's `Origin` header
against `TrustedOrigins` and sets `BypassRateLimitContextKey`, which is honoured by all three
of the checks in the way:

| Check | File |
|---|---|
| Email gate | `internal/platform/adapters/http/middleware/email_gate.go` (both `Require` and `Observe`) |
| Rate limiter | `internal/platform/adapters/http/middleware/rate_limit.go` |
| Render limiter | `internal/platform/adapters/http/middleware/render_limit.go` |

`avacar.docs.xix3d.com` is already on the list for the same reason. This is the same request
for a second internal test surface.

---

## Exactly which origin, and why only this one

**`https://embed-compare2.vercel.app`** — scheme and host, no path, no trailing slash. That is
what a browser sends in `Origin`, and `BypassRateLimit` does an exact string match on it
(`set[c.Request().Header.Get("Origin")]`), so a mismatch fails silently and looks like the
bypass simply not working.

Verified before writing this: that host serves the comparison page (`<title>Embed
Comparison</title>`). The other Vercel hostname for the project,
`embed-compare2-xix3-d.vercel.app`, returns Vercel's login page instead and should **not** be
added — it is not a working surface, and adding a URL that returns a login form to a security
allowlist buys nothing.

Vercel also mints a unique hostname per deployment (`embed-compare2-<hash>-xix3-d.vercel.app`).
Please do **not** add a wildcard for those. The stable production hostname is the one testers
use, per-deployment URLs are ephemeral, and a wildcard over `*.vercel.app` would hand the
bypass to anyone with a Vercel account.

---

## How to confirm it worked

From any machine:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app/api/v1/render/v2/chain/stream \
  -H 'Origin: https://embed-compare2.vercel.app' \
  -H 'X-Session-ID: 11111111-2222-3333-4444-555555555555'
```

`411` (Length Required) means the request got past the gate and died on the empty body — which
is the pass. `428` means the bypass did not match, and the likely cause is a typo, a trailing
slash, or the change not being deployed to the v2 test service.

In the browser, the site's own debug sidebar shows each render's stages; renders that reach the
pipeline report `session_upsert`, `vehicle_detection` and the rest, whereas a gated one shows no
stages at all.

---

## Scope and risk

- **Only affects visitor limits.** The bypass covers the email gate, the rate limiter and the
  render limiter. It does not touch auth, quota accounting, or CORS — `Access-Control-Allow-Origin`
  is already `*` on this service.
- **No billing impact either way.** v2 renders already log through `LogNonBillableRender` with
  the hardcoded `v2TestManufacturerID = 8` (Test Co) and `CountsTowardUsage: false`, so they are
  attributed to the test account regardless of which customer's embed token was used. Whitelisting
  changes nothing about that.
- **Image-model spend is real**, and it is the one cost that rises: a v2 render is roughly 1.5x a
  v1 one, and removing the visitor limits removes the thing currently capping how many get run.
  Worth knowing rather than discovering on an invoice.
- **Remove it when v2 testing ends.** This is a temporary test surface, not a product URL.
