/**
 * Every way a render can be refused or fail, reduced to the screen the visitor sees.
 *
 * The backend reports problems three ways: an HTTP status with a JSON body before the stream
 * opens, a structured JSON string inside an SSE `error` event's `message`, or plain text in that
 * same `message`. The widget used to show whatever text arrived ("Render request failed (402)",
 * raw JSON), so each one is mapped here to one of a few screens, and anything unknown falls to
 * "Render failed" + Try again.
 *
 * The codes are the backend's (see the backend requirements doc, table R4). Keep them in step.
 */
import type { RenderProblem } from '../types'

const PAUSED = new Set(['quota_exceeded', 'card_required', 'payment_overdue', 'daily_render_limit_reached'])
const SLOW = new Set(['embed_rate_limited', 'render_rate_limited', 'rate limit exceeded'])
const PHOTO = new Set(['photo_unreadable', 'photo_too_small', 'photo_too_large'])

function numberOrUndefined(v: unknown) {
  return typeof v === 'number' ? v : undefined
}

/** The screen for a backend error code, or null when the code is not one the widget knows. */
function fromCode(code: string, body: Record<string, unknown>): RenderProblem | null {
  if (code === 'visitor_limit_reached') {
    return { kind: 'limit', code, limit: numberOrUndefined(body.limit), used: numberOrUndefined(body.used) }
  }
  if (PAUSED.has(code)) return { kind: 'paused', code }
  if (SLOW.has(code)) return { kind: 'slow', code }
  if (PHOTO.has(code)) return { kind: 'badfile', code }
  if (code === 'mask_gate_failed') return { kind: 'nowheels', code }
  if (code === 'no_car') return { kind: 'nocar', code }
  if (code === 'embed_session_not_bound') return { kind: 'expired', code }
  // A dealer's wheel that left the catalogue (or whose brand was switched off) after the list was read.
  if (code === 'product_not_in_catalogue') return { kind: 'gone', code }
  if (code === 'embed_catalogue_unavailable') return { kind: 'nolist', code }
  // A brand's code whose wheel has left the site: nothing to pick instead, so the renders are paused.
  if (code === 'product_not_in_embed') return { kind: 'paused', code }

  return null
}

/** A refusal that arrived as an HTTP status before any stream. Never throws. */
export async function problemFromResponse(res: Response): Promise<RenderProblem> {
  let body: Record<string, unknown> = {}

  try {
    const parsed = await res.clone().json()

    if (parsed && typeof parsed === 'object') body = parsed
  } catch { /* not JSON: the status decides */ }

  const code = typeof body.error === 'string' ? body.error : ''
  const known = code ? fromCode(code, body) : null

  if (known) return known
  if (res.status === 402) return { kind: 'paused', code }
  // Any other 429 is a throttle. Some carry no `message` at all ("rate limit exceeded").
  if (res.status === 429) return { kind: 'slow', code }
  if (res.status === 401) return { kind: 'expired', code }
  if (res.status === 413) return { kind: 'badfile', code }

  return { kind: 'fail', code: code || String(res.status) }
}

/** A failure reported inside the stream, as the payload of an SSE `error` event. */
export function problemFromStreamError(data: unknown): RenderProblem {
  const message = data && typeof data === 'object' && typeof (data as { message?: unknown }).message === 'string'
    ? (data as { message: string }).message
    : ''
  let inner: Record<string, unknown> | null = null

  try {
    const parsed = JSON.parse(message)

    if (parsed && typeof parsed === 'object') inner = parsed
  } catch { /* plain text */ }

  // A throttle can also arrive in-stream with its code at the top level, not inside `message`.
  const outer = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const source = inner && typeof inner.error === 'string' ? inner : outer
  const code = typeof source.error === 'string' ? source.error : ''

  if (code) return fromCode(code, source) ?? { kind: 'fail', code }

  // Car detection still reports in plain text (backend R4 asks for `no_car`).
  if (/not appear to be a car/i.test(message)) return { kind: 'nocar' }

  return { kind: 'fail' }
}
