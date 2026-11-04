/**
 * Two-pass (v2) render client: the pipeline render.xix3D runs.
 *
 * The production widget (src/index.tsx) renders wheels through it; the comparison entry
 * (src/index-v2.tsx) uses it with debug capture on. Kept out of the main API client so the
 * v1 client stays as it was for wraps.
 *
 * See docs/plans/TWO_PASS_EMBED_PLAN.md for the pipeline itself.
 */
import { parseEmailGateBody, parseVisitorUsage } from './api'
import { problemFromResponse, problemFromStreamError } from './render-problems'
import type {
  RenderStreamEvents,
  V2ErrorData,
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
  /** True once the failure has been reported to the caller, so it is never reported twice. */
  reported?: boolean
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
  state: V2StreamState,
): Promise<V2StreamState> {
  const decoder = new TextDecoder()
  let buffer = ''
  const usage = (data: unknown) => {
    const u = parseVisitorUsage(data)

    if (u) handlers.onVisitorUsage?.(u)
  }

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
          usage(data)
          break
        // The render_logs ids of the delivered render: what "Email my renders" sends (R7).
        case 'recorded':
          if (Array.isArray(data.render_log_ids)) {
            handlers.onRecorded?.(data.render_log_ids.filter((id: unknown): id is number => typeof id === 'number'))
          }
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
          usage(data)
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

          state.reported = true

          if (gate) {
            handlers.onEmailGateRequired?.(gate)
          } else {
            // The structured detail still goes to onV2Error, which the comparison build shows;
            // the visitor's screen comes from onProblem.
            if (v2Error) {
              state.v2Error = v2Error
              handlers.onV2Error?.(v2Error)
            }
            handlers.onError?.(v2Error?.message || message)
            handlers.onProblem?.(problemFromStreamError(data))
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
     * Ask the backend for the debug stream: the model-input capture (`debug_prompts`, ~6 KB)
     * and, on an audit rejection, the rejected image instead of an error. The comparison
     * build only. A customer must never be shown an image the audit rejected.
     */
    debug?: boolean
    /**
     * Send the reference image BYTES as well as their metadata. Needs `debug`.
     *
     * Off by default because the backend measured a ~20 MB SSE payload for one render with this
     * on. Metadata alone (~6 KB) already names the wrong reference; the bytes are for when you
     * need to look at it. Worth turning on for a single render, not for a whole session.
     */
    debugImages?: boolean
    /** This browser's visitor id (utils/visitor.ts), sent for the per-visitor limit (R1). */
    visitorId?: string
    /**
     * Also send it as the X-Visitor-ID header. Only once the backend says it reads it: today's
     * CORS allow-list does not name that header, and a preflight refusal would fail every render.
     */
    visitorHeader?: boolean
  },
): Promise<V2RenderResult> {
  const formData = new FormData()
  const headers: Record<string, string> = { 'X-Session-ID': sessionId }

  if (options?.visitorId) {
    // A form field never triggers CORS, so the backend can count from this field on day one.
    formData.append('visitor_id', options.visitorId)
    if (options.visitorHeader) headers['X-Visitor-ID'] = options.visitorId
  }

  formData.append('vehicle_image', file, 'vehicle.png')
  formData.append('products', JSON.stringify([{
    product_id: product.product_id,
    ...(product.variant_id ? { variant_id: product.variant_id } : {}),
  }]))
  formData.append('manufacturer_id', String(manufacturerId))
  formData.append('fast_mode', 'true')

  // Model-input capture. `debug_prompts` is ~6 KB and answers most attribution questions on its
  // own — which prompt was sent, and which reference asset each image slot pointed at.
  // `debug_images` adds the bytes and is opt-in.
  if (options?.debug) {
    formData.append('debug', 'true')
    formData.append('debug_prompts', 'true')
    if (options.debugImages) formData.append('debug_images', 'true')
  }

  const state: V2StreamState = { image: '' }

  try {
    const res = await fetch(`${baseUrl}/api/v1/render/v2/chain/stream`, {
      method: 'POST',
      headers,
      body: formData,
      signal,
    })

    // A refusal arrives as a BODY, not a stream. Throwing on any non-ok status turned the email
    // gate's 428 into "Render request failed (428)" and a 402 into the same raw text; each
    // status now goes to its own screen (utils/render-problems.ts).
    if (!res.ok) {
      const gate = await parseEmailGateBody(res)

      state.reported = true

      if (gate) {
        events.onEmailGateRequired?.(gate)

        return { success: false, error: 'Email required' }
      }

      const problem = await problemFromResponse(res)

      events.onError?.(`Render refused (${res.status} ${problem.code || ''})`)
      events.onProblem?.(problem)

      return { success: false, error: problem.kind }
    }

    if (!res.body) throw new Error('No response body')

    await readStream(res.body.getReader(), events, state)

    if (!state.image) {
      throw new Error('Stream ended before a complete image was received')
    }

    return { success: true, image: state.image }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { success: false, error: 'Request cancelled' }
    }

    const error = e instanceof Error ? e.message : 'Unknown error'

    // A dropped connection, a stream that ended early: the visitor sees "Render failed".
    if (!state.reported) {
      events.onError?.(error)
      events.onProblem?.({ kind: 'fail' })
    }

    return { success: false, error, v2Error: state.v2Error }
  }
}
