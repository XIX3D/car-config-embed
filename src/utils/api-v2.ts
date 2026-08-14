/**
 * Two-pass (v2) render client.
 *
 * DELIBERATELY A SEPARATE MODULE, not a function on the main API client.
 *
 * The widget entry point (src/index.tsx) constructs `createApiClient` unconditionally, so
 * anything living inside it ships in every bundle — including `latest`, which every
 * embedded customer site loads. A build-time allowlist can gate a URL, but it cannot make
 * a method on an always-constructed object provably unreachable, so the minifier keeps it
 * and the v2 strings land in production. That is not theoretical: it happened, and
 * tools/check-bundle-isolation.mjs caught it.
 *
 * Keeping v2 in its own module means the guarantee is structural. `latest` never imports
 * this file, so none of it can reach that bundle no matter what the minifier decides. Only
 * the comparison page imports it.
 *
 * See docs/plans/TWO_PASS_EMBED_PLAN.md for the pipeline itself.
 */
import { parseEmailGateBody, parseQuotaBody } from './api'
import type {
  RenderStreamEvents,
  V2ErrorData,
  QuotaExceededError,
  EmailGateResponse,
} from '../types'

export interface V2RenderResult {
  success: boolean
  image?: string
  error?: string
  /** Present on a structured failure. Carries whether a retry is worth attempting. */
  v2Error?: V2ErrorData
}

/**
 * Pull a structured v2 failure out of an `error` event.
 *
 * The backend routes v2 errors through the same SSE error writer v1 uses, so the payload
 * arrives JSON-encoded INSIDE `data.message` rather than as top-level fields — the same
 * shape the email gate already uses. Reading `data.retryable` directly would always be
 * undefined, which happens to be right for two of the three cases and wrong for the third.
 */
export function parseV2ErrorEvent(data: unknown): V2ErrorData | null {
  if (!data || typeof data !== 'object') return null

  const outer = data as Record<string, unknown>

  if (typeof outer.message !== 'string') return null

  let inner: Record<string, unknown>

  try {
    inner = JSON.parse(outer.message)
  } catch {
    return null
  }

  const kind = inner.error

  if (
    kind !== 'model_refused'
    && kind !== 'render_failed'
    && kind !== 'mask_gate_failed'
    && kind !== 'audit_failed'
  ) {
    return null
  }

  const reasons = Array.isArray(inner.reasons)
    ? inner.reasons.filter((r): r is string => typeof r === 'string')
    : undefined

  // `audit_failed` is the Gemini post-check rejecting the COMPOSITED image, and it arrives in
  // a different shape from the other three: its explanation is in `reason` (singular, with a
  // `confidence`), not `reasons`. Omitting it here was a real gap — the gallery slot went to
  // "failed, click to retry" with nothing anywhere saying why, which is indistinguishable from
  // a broken render.
  if (kind === 'audit_failed') {
    const reason = typeof inner.reason === 'string' ? inner.reason : null
    const confidence = typeof inner.confidence === 'number' ? inner.confidence : null

    return {
      error: kind,
      message: typeof inner.message === 'string' ? inner.message : 'Render failed quality check',
      // Retryable: the audit is a model judgement on model output, so both vary between
      // attempts. Unlike a refusal, the same request can genuinely pass next time.
      retryable: true,
      reasons: reason
        ? [confidence !== null ? `${reason} (confidence ${confidence})` : reason]
        : reasons,
    }
  }

  return {
    error: kind,
    message: typeof inner.message === 'string' ? inner.message : 'Render failed',
    stage: inner.stage === 'mask' || inner.stage === 'fill' ? inner.stage : undefined,
    // Absent means terminal. mask_gate_failed carries no flag and must never be retried.
    retryable: inner.retryable === true,
    reasons,
  }
}

function parseEmailGateEvent(data: unknown): EmailGateResponse | null {
  if (!data || typeof data !== 'object') return null

  const d = data as Record<string, unknown>

  if (typeof d.message !== 'string') return null

  let inner: Record<string, unknown>

  try {
    inner = JSON.parse(d.message)
  } catch {
    return null
  }

  if (inner.error !== 'email_required' || typeof inner.free_sessions_limit !== 'number') {
    return null
  }

  return {
    email_required: true,
    free_sessions_used: typeof inner.free_sessions_used === 'number' ? inner.free_sessions_used : 0,
    free_sessions_limit: inner.free_sessions_limit,
  }
}

interface V2StreamState {
  image: string
  v2Error?: V2ErrorData
}

/**
 * Read the v2 SSE stream.
 *
 * Handles v1's events too, since v2 emits the same `started` / `vehicle_detected` /
 * `complete` / `error` set plus four of its own. Unknown events are ignored, so the backend
 * can add more without breaking this.
 */
async function readStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: RenderStreamEvents,
): Promise<V2StreamState> {
  const decoder = new TextDecoder()
  const state: V2StreamState = { image: '' }
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()

    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const chunks = buffer.split('\n\n')

    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const eventMatch = chunk.match(/^event: (.+)$/m)
      const dataMatch = chunk.match(/^data: (.+)$/m)

      if (!eventMatch || !dataMatch) continue

      const event = eventMatch[1]
      // Payloads are validated by the handlers that consume them; the stream reader only
      // routes. A malformed frame is skipped rather than aborting the render.
      let data: any

      try {
        data = JSON.parse(dataMatch[1])
      } catch {
        continue
      }

      switch (event) {
        case 'started':
          handlers.onStarted?.()
          break
        case 'vehicle_detected':
          handlers.onVehicleDetected?.(data)
          break
        case 'mask_started':
          handlers.onMaskStarted?.(data)
          break
        case 'mask_complete':
          handlers.onMaskComplete?.(data)
          break
        case 'fill_started':
          handlers.onFillStarted?.()
          break
        case 'composite_complete':
          handlers.onCompositeComplete?.(data)
          break
        case 'debug':
          handlers.onDebug?.(data)
          break
        case 'complete':
          state.image = `data:image/png;base64,${data.image_b64}`
          handlers.onComplete?.(data)
          break
        // The audit rejecting the composited image, on a DEBUG request. The backend takes a
        // different path here from the non-debug one: instead of an `error` event carrying
        // `audit_failed`, it emits this — with the rejected image attached, so it can be
        // inspected rather than merely counted.
        //
        // Unhandled, a debug render that fails the audit sends neither `complete` nor `error`,
        // so the caller sees the stream simply end: no image, no reason, and a gallery slot
        // stuck on "failed, click to retry" with nothing to explain it. That is exactly the
        // symptom this was found from.
        case 'audit_failed_debug': {
          const auditError: V2ErrorData = {
            error: 'audit_failed',
            message: 'Render failed the quality check',
            // A model judging model output: both vary between attempts, so unlike a refusal
            // the same request can genuinely pass next time.
            retryable: true,
            reasons: data.reason
              ? [typeof data.confidence === 'number'
                ? `${data.reason} (confidence ${data.confidence})`
                : String(data.reason)]
              : undefined,
          }

          state.v2Error = auditError

          // DELIVER THE IMAGE. The audit rejected it, but the backend still sends it and it is
          // the thing under evaluation — hiding it means judging the pipeline by a model's
          // opinion of it rather than by looking. The rejection is not lost: onV2Error still
          // fires, so the sidebar reports the failure and its reason alongside the render.
          //
          // This is deliberate for the comparison build. Production hides a rejected render,
          // which is the right call when shipping to a customer and the wrong one when the
          // whole point is deciding whether the audit is calibrated correctly.
          if (data.image_b64) {
            state.image = `data:image/png;base64,${data.image_b64}`
            handlers.onAuditFailedImage?.(state.image)
            handlers.onComplete?.({ image_b64: data.image_b64 })
          }

          handlers.onV2Error?.(auditError)
          break
        }
        case 'error': {
          const gate = parseEmailGateEvent(data)
          const v2Error = gate ? null : parseV2ErrorEvent(data)
          const message: string = data.message

          if (gate) {
            handlers.onEmailGateRequired?.(gate)
          } else if (v2Error) {
            state.v2Error = v2Error
            handlers.onV2Error?.(v2Error)
            handlers.onError?.(v2Error.message)
          } else if (typeof data.retry_after_seconds === 'number') {
            handlers.onQuotaExceeded?.(data as QuotaExceededError)
          } else {
            handlers.onError?.(message)
          }

          throw new Error(v2Error?.message || message || 'Stream error')
        }
        default:
          break
      }
    }
  }

  return state
}

/**
 * Run one two-pass render.
 *
 * `sessionId` MUST be a stable UUID across a browsing session: it keys the backend's mask
 * cache, so every render after the first on the same photo skips pass 1 (~14s and one
 * image-model call). A non-UUID is silently replaced per request — renders still succeed,
 * they just each pay full price, with no visible symptom.
 *
 * v2 takes exactly one product and wheels only; the backend rejects anything else.
 */
export async function renderStreamV2(
  baseUrl: string,
  sessionId: string,
  file: Blob,
  product: { product_id: number; variant_id?: number },
  manufacturerId: number,
  events: RenderStreamEvents,
  signal?: AbortSignal,
  options?: {
    /**
     * Send the reference image BYTES as well as their metadata.
     *
     * Off by default because the backend measured a ~20 MB SSE payload for one render with this
     * on. Metadata alone (~6 KB) already names the wrong reference; the bytes are for when you
     * need to look at it. Worth turning on for a single render, not for a whole session.
     */
    debugImages?: boolean
  },
): Promise<V2RenderResult> {
  const formData = new FormData()

  formData.append('vehicle_image', file, 'vehicle.png')
  formData.append('products', JSON.stringify([{
    product_id: product.product_id,
    ...(product.variant_id ? { variant_id: product.variant_id } : {}),
  }]))
  formData.append('manufacturer_id', String(manufacturerId))
  formData.append('fast_mode', 'true')
  formData.append('debug', 'true')

  // Model-input capture. `debug_prompts` is ~6 KB and answers most attribution questions on its
  // own — which prompt was sent, and which reference asset each image slot pointed at — so it is
  // always on for this comparison build. `debug_images` adds the bytes and is opt-in.
  formData.append('debug_prompts', 'true')
  if (options?.debugImages) formData.append('debug_images', 'true')

  let captured: V2ErrorData | undefined

  const wrapped: RenderStreamEvents = {
    ...events,
    onV2Error: (data) => {
      captured = data
      events.onV2Error?.(data)
    },
  }

  try {
    const res = await fetch(`${baseUrl}/api/v1/render/v2/chain/stream`, {
      method: 'POST',
      headers: { 'X-Session-ID': sessionId },
      body: formData,
      signal,
    })

    // A refusal arrives as a BODY, not a stream, and must be handled as a gate or quota event
    // rather than a failed render. Throwing on any non-ok status turned the email gate's 428
    // into "Render request failed (428)": the gate never opened, and every render died in a
    // fraction of a second with no explanation. Same handling as the v1 client, reusing its
    // parsers so the two cannot drift apart.
    if (!res.ok) {
      const gate = await parseEmailGateBody(res)

      if (gate) {
        events.onEmailGateRequired?.(gate)

        return { success: false, error: 'Email required' }
      }

      const quota = await parseQuotaBody(res)

      if (quota) {
        events.onQuotaExceeded?.(quota)

        return { success: false, error: quota.message }
      }

      throw new Error(`Render request failed (${res.status})`)
    }

    if (!res.body) throw new Error('No response body')

    const state = await readStream(res.body.getReader(), wrapped)

    if (!state.image) {
      throw new Error('Stream ended before a complete image was received')
    }

    return { success: true, image: state.image }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { success: false, error: 'Request cancelled' }
    }

    const error = e instanceof Error ? e.message : 'Unknown error'

    // Already reported through onV2Error with its retryability intact.
    if (!captured) events.onError?.(error)

    return { success: false, error, v2Error: captured }
  }
}
