# Ask: put the two passes' actual model inputs in the v2 debug event

**For:** the CarConfig (Go backend) side
**From:** the car-config-embed side
**Written:** 2026-08-13

---

## The problem

When a v2 render comes out wrong there is currently no way to tell **whether the model failed
or whether we sent it the wrong inputs**. Those need completely different fixes — one is a
prompt/model problem, the other is a bug in reference selection — and today they are
indistinguishable from the outside.

v1 can answer this. Its debug event carries `parts`: the full ordered list of what was sent to
the model, text and images, which the embed already renders in a debug panel
(`src/components/Debug/DebugPanel.tsx`). v2 has no equivalent.

## What v2 sends today

From `render_v2_handler.go`, the `debug` event:

```
pipeline, mask_cached, mask_attempts, fill_attempts,
request_timings, mask_timings, fill_timings,
mask_verdict, mask_repair, socket_stats, outside_verdict,
total_ms, mask_b64
```

Good for *what happened*. Nothing about *what went in* — no prompt text, and no record of which
reference images were used.

The inputs are built in `TwoPassService.generateImage` (`twopass_service.go`) and discarded once
the call returns:

- **Pass 1 (mask)** — prompt `compositor.MaskPrompt(s.key)`, images: `[photo]`
- **Pass 2 (fill)** — prompt `compositor.FillPrompt(in, s.key)`, images:
  `[mask.Composited, ...references]`

Both are already in hand at the call site. Nothing needs recomputing; they just need recording.

## The ask

Add a `passes` array to the v2 debug event, one entry per model call, in the same spirit as v1's
`parts`:

```json
"passes": [
  {
    "pass": "mask",
    "attempts": 1,
    "prompt": "<the full text of MaskPrompt>",
    "images": [
      { "role": "customer_photo", "mime_type": "image/jpeg", "size_bytes": 812004 }
    ]
  },
  {
    "pass": "fill",
    "attempts": 1,
    "prompt": "<the full text of FillPrompt>",
    "images": [
      { "role": "masked_car",  "mime_type": "image/png", "size_bytes": 934112 },
      { "role": "reference", "source": "<the storage path or URL>", "mime_type": "image/png", "size_bytes": 220145 },
      { "role": "reference", "source": "<...>", "mime_type": "image/png", "size_bytes": 198320 }
    ]
  }
]
```

### Why these fields

- **`prompt` in full, not truncated.** The whole question is whether the prompt said what we
  think it said. A summary cannot answer that.
- **`role`** — which slot each image occupied. Pass 2 sends masked-car first, then references,
  and the prompt refers to them by position; a wrong order is a plausible bug and invisible
  without this.
- **`source` on references** — the storage path or URL. This is the single most valuable field:
  it is what lets a tester see that the wrong wheel's studio photo was sent. Currently the only
  way to notice is to recognise the wheel by eye in the output.
- **`size_bytes` / `mime_type`** — cheap, and catch a truncated or wrong-format upload.

### Please also include the reference images themselves, behind the existing debug flag

`mask_b64` already ships a full image on debug requests via `optionalB64`, so the precedent and
the size tolerance both exist. Add the same for pass-2 inputs:

```json
"images": [ { "role": "reference", "source": "...", "b64": "<...>" } ]
```

Seeing the reference *next to* the render is what actually settles "did nano banana screw up or
did we send the wrong picture" — metadata narrows it, the image answers it. If payload size is a
concern, gating this behind a separate stronger flag (`debug_images=true`) would be fine; the
metadata alone is still a large improvement.

## Two smaller gaps in `mask_b64`, worth fixing at the same time

`mask_b64` already ships `mask.Composited` — the customer photo with flat chroma sockets painted
over the rims, which is byte-identical to the first image pass 2 receives. That is genuinely
useful and the embed now displays it. Two gaps limit it:

**1. Nothing is sent when the mask gate fails.** `Composited` is only built inside
`if res.Verdict.Passed` (`twopass_service.go`, stage 3), so a `mask_gate_failed` render carries
no image — exactly the case where seeing the mask matters most. Right now a gate failure gives a
verdict and reasons with no way to look at what was rejected. Compositing after a failure costs
one clone and one encode, which seems a fair price for making the failure inspectable; if that
is unwelcome, sending the raw `maskImg` instead would still answer it.

**2. `res.Mask` is built but never shipped.** That is the raw model output before compositing.
Having both separates two different faults: the model painting sockets in the wrong place
(`Mask` is wrong) versus our compositing placing them wrongly (`Mask` fine, `Composited`
wrong). Adding `raw_mask_b64` alongside `mask_b64` would make that distinction visible.

## Notes

- **Debug-only.** Same gate as the existing `debug` event. None of this should reach a customer
  render.
- **The audit prompt would be useful too**, for the same reason: `render_audit` rejections are
  currently a verdict with no way to see what was asked. Lower priority than the two passes.
- **No embed-side work is blocked on this.** The embed already has a debug panel pattern to
  reuse for v1; once `passes` exists, showing it is straightforward. Until then this cannot be
  built at all, because the data does not leave the backend.

## Why it matters now

The v2 comparison site (`embed-compare2.vercel.app`) is in front of testers, and the most common
report is "this render looks wrong". Without the inputs, every one of those needs a backend
engineer reading logs to triage. With them, a tester can say "the reference image was the wrong
finish" or "the prompt looks right, the model ignored it" — which is the difference between a
useful bug report and a screenshot.
