---
title: v2 Comparison
---

# Two-Pass (v2) Comparison

Runs the current single-pass pipeline and the experimental two-pass pipeline against the
same photo and finish, side by side.

::: warning Internal test page
Renders here go to a separate test backend and are logged as non-billable against Test Co.
Nothing on this page affects the widget running on customer sites — that build cannot
reach v2 at all.
:::

## What is being compared

**v1 (single pass)** sends the customer photo, the wheel references and a text prompt in
one image-model call. The model regenerates the whole photograph, so the sky, tarmac and
bodywork are all subtly redrawn — and because the old wheel is still visible in the input,
its shape and colour leak into the result.

**v2 (two pass)** makes one call that deletes the wheels and paints flat magenta sockets,
repairs and composites those sockets in code, then makes a second call that fills them
working only from studio references. Code then pastes back **only the socket pixels**. Pass
two never sees the old wheel, so it cannot copy it, and outside-socket change drops from a
measured 11–18% to effectively zero — by construction, not by prompt wording.

## What to look for

The defects v2 targets are the ones that are obvious side by side and nearly invisible when
judging a single render:

- **Structure drift** — every wheel sliding toward the same generic mid-weight
  five-double-spoke, regardless of what the real wheel looks like.
- **Deleted signature features** — a wheel's distinguishing detail (a pocket ring, a
  stepped lip) quietly disappearing.
- **Colour migration** — the old wheel's colour turning up somewhere it does not belong,
  classically as hallucinated painted brake calipers on a car that has none.
- **Scene damage** — background, bodywork or lighting changing when only the wheels should
  have.

## Known limits, so they are not reported as new

These ship with v2 and are documented, not surprises:

- **Brake calipers are re-rendered, not preserved.** Pass two never sees what was behind
  the wheel.
- **Centre-cap lettering comes out mirrored or garbled** on essentially every wheel.
- **Saturated finishes land under their target** — copper and similar read muted; aluminium
  and greys are near perfect.

## Timing

Measured on the test backend: a first render on a new photo takes about **45s**, and every
later finish on that same photo about **30s**, because the mask is cached per photo. The
session ID is what makes that caching work — start a new session to measure a cold render
deliberately.

<V2Comparison />
