import type { Product, Variant, QuoteRequest, RenderStreamEvents, DecodeTokenResponse, ValidateTokenResponse, VehicleDetectionResult, SimilarProduct, EmailGateResponse, VisitorUsage } from '../types'
import { problemFromResponse, problemFromStreamError } from './render-problems'

/**
 * The visitor's limit and use, from a `started` or `complete` event or the email-required
 * response (backend R2). Either naming is accepted; null when either number is missing, which
 * is every response today.
 */
export const parseVisitorUsage = (data: unknown): VisitorUsage | null => {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const limit = d.visitor_limit ?? d.limit
  const used = d.visitor_used ?? d.used

  return typeof limit === 'number' && typeof used === 'number' ? { limit, used } : null
}

/**
 * Exported so the two-pass client reuses this rather than reimplementing it.
 *
 * A render request can be refused with a body rather than a stream (428 for the email gate)
 * and that must open the gate, not fail the render.
 */
export const parseEmailGateBody = async (res: Response): Promise<EmailGateResponse | null> => {
  try {
    const body = await res.clone().json()
    if (body && body.error === 'email_required' && typeof body.free_sessions_limit === 'number') {
      return {
        email_required: true,
        free_sessions_used: body.free_sessions_used,
        free_sessions_limit: body.free_sessions_limit,
      }
    }
  } catch { /* fall through */ }
  return null
}

const parseEmailGateEvent = (data: unknown): EmailGateResponse | null => {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.message !== 'string') return null
  let inner: Record<string, unknown>
  try {
    inner = JSON.parse(d.message)
  } catch {
    return null
  }
  if (inner.error !== 'email_required' || typeof inner.free_sessions_limit !== 'number') return null
  return {
    email_required: true,
    free_sessions_used: typeof inner.free_sessions_used === 'number' ? inner.free_sessions_used : 0,
    free_sessions_limit: inner.free_sessions_limit,
  }
}

interface SSEStreamResult {
  image?: string
  vehicle?: string
}

interface SSEStreamOptions {
  detectVehicle?: boolean
  /** Set once a failure has been reported, so the caller's catch does not report it again. */
  state?: { reported?: boolean }
}

async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  handlers: Partial<RenderStreamEvents>,
  options: SSEStreamOptions = {}
): Promise<SSEStreamResult> {
  const decoder = new TextDecoder()
  let buffer = ''
  let finalImage = ''
  let detectedVehicle = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() || ''

    for (const chunk of lines) {
      const eventMatch = chunk.match(/^event: (.+)$/m)
      const dataMatch = chunk.match(/^data: (.+)$/m)
      if (!eventMatch || !dataMatch) continue

      const event = eventMatch[1]
      const data = JSON.parse(dataMatch[1])

      switch (event) {
        case 'started':
          handlers.onStarted?.()
          break
        case 'recorded':
          if (Array.isArray(data.render_log_ids)) handlers.onRecorded?.(data.render_log_ids)
          break
        case 'vehicle_detected':
          if (options.detectVehicle) {
            detectedVehicle = `${data.year} ${data.make} ${data.model}`
            handlers.onVehicleDetected?.(data)
          }
          break
        case 'progress':
          handlers.onProgress?.(data)
          break
        case 'step_complete':
          handlers.onStepComplete?.(data)
          break
        case 'debug':
          handlers.onDebug?.(data)
          break
        case 'complete': {
          finalImage = `data:image/png;base64,${data.image_b64}`
          handlers.onComplete?.(data)
          const usage = parseVisitorUsage(data)
          if (usage) handlers.onVisitorUsage?.(usage)
          break
        }
        case 'error': {
          const gate = parseEmailGateEvent(data)
          if (options.state) options.state.reported = true
          if (gate) {
            handlers.onEmailGateRequired?.(gate)
          } else {
            handlers.onError?.(data.message)
            handlers.onProblem?.(problemFromStreamError(data))
          }
          throw new Error(data.message || 'Stream error')
        }
      }
    }
  }

  return { image: finalImage, vehicle: detectedVehicle }
}

export function createApiClient(baseUrl: string) {
  let _sessionId: string | null = null
  let _visitor: { id: string; header: boolean } | null = null

  const setSessionId = (id: string) => { _sessionId = id }

  /** See renderStreamV2's `visitorHeader` for why the header waits for the backend to ask. */
  const setVisitor = (id: string, header: boolean) => { _visitor = { id, header } }
  const getVisitor = () => _visitor

  const sessionHeaders = (): Record<string, string> =>
    _sessionId ? { 'X-Session-ID': _sessionId } : {}

  const renderHeaders = (): Record<string, string> => ({
    ...sessionHeaders(),
    ...(_visitor?.header ? { 'X-Visitor-ID': _visitor.id } : {}),
  })

  const decodeToken = async (token: string): Promise<DecodeTokenResponse | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/embed/decode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  const validateToken = async (token: string): Promise<ValidateTokenResponse | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/embed/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })

      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  const fetchProduct = async (productId: string): Promise<Product | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}`, {
        headers: sessionHeaders(),
      })
      const data = await res.json()

      return data.product ?? (data.success ? data.product : null)
    } catch {
      return null
    }
  }

  const fetchVariants = async (
    productId: string,
    allowedIds?: string[],
  ): Promise<Variant[]> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}/variants`, {
        headers: sessionHeaders(),
      })
      const data = await res.json()

      if (!res.ok) return []
      let variants = (data.variants ?? []) as Variant[]

      if (allowedIds?.length) {
        variants = variants.filter((v) => allowedIds.includes(v.id))
      }

      return variants
    } catch {
      return []
    }
  }

  const fetchDefaultVariant = async (productId: string): Promise<Variant | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}/variants/default`, {
        headers: sessionHeaders(),
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.variant ?? null
    } catch {
      return null
    }
  }

  const detectVehicle = async (file: File): Promise<VehicleDetectionResult | null> => {
    try {
      const formData = new FormData()
      formData.append('image', file)

      const res = await fetch(`${baseUrl}/api/v1/products/detect-vehicle`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: formData,
      })

      if (!res.ok) return null
      const data = await res.json()
      return data.vehicle ?? null
    } catch {
      return null
    }
  }

  const fetchSimilarProducts = async (productId: string): Promise<SimilarProduct[]> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}/similar`, {
        headers: sessionHeaders(),
      })
      if (!res.ok) return []
      const data = await res.json()
      return data.similar ?? []
    } catch {
      return []
    }
  }

  const getProductThumbnailUrl = (productId: string, width?: number, height?: number): string => {
    const params = new URLSearchParams()
    if (width) params.set('width', String(width))
    if (height) params.set('height', String(height))
    const qs = params.toString()
    return `${baseUrl}/api/v1/products/${productId}/thumbnail${qs ? `?${qs}` : ''}`
  }

  const render = async (
    file: File,
    products: Array<{ product_id: string; variant_id?: string }>,
    manufacturerId: number,
  ): Promise<{ success: boolean; final_image?: string; detected_vehicle?: string; error?: string }> => {
    const formData = new FormData()

    formData.append('vehicle_image', file)
    formData.append('products', JSON.stringify(products))
    formData.append('manufacturer_id', String(manufacturerId))

    try {
      const res = await fetch(`${baseUrl}/api/v1/render/chain`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: formData,
      })

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('image/')) {
        const blob = await res.blob()
        return { success: true, final_image: URL.createObjectURL(blob) }
      }

      const data = await res.json()
      if (data.success && data.image) {
        return { ...data, final_image: data.image }
      }
      throw new Error(data.error || 'Failed to generate')
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  }

  const getEmailGate = async (manufacturerId?: number): Promise<EmailGateResponse | null> => {
    try {
      const url = manufacturerId
        ? `${baseUrl}/api/v1/render/email-required?manufacturer_id=${manufacturerId}`
        : `${baseUrl}/api/v1/render/email-required`
      const res = await fetch(url, {
        headers: sessionHeaders(),
      })
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  /**
   * A JSON POST that only reports whether it worked, and the status when it did not. The
   * visitor sees one line for any failure ("Couldn't send. Try again."), never the server's
   * text; a 401 means the embed session ended and goes to that screen instead.
   */
  const postJson = async (path: string, body: unknown): Promise<{ success: boolean; status?: number }> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify(body),
      })

      if (!res.ok) return { success: false, status: res.status }

      const data = await res.json().catch(() => ({}))

      return { success: data?.success !== false }
    } catch {
      return { success: false }
    }
  }

  const submitQuote = (request: QuoteRequest) => postJson('/quote/request', request)

  const submitLead = (request: QuoteRequest) => postJson('/quote/lead', request)

  /**
   * "Email my renders" (backend R7). The endpoint does not exist yet; the widget only calls it
   * when the backend has said so with `features.email_renders` on GET /render/email-required.
   */
  const emailRenders = (email: string, renderLogIds: number[]) =>
    postJson('/embed/email-renders', { email, render_log_ids: renderLogIds })

  const getStorageUrl = (path: string) =>
    `${baseUrl}/storage/${path}`

  const renderSingle = async (
    file: File,
    productId: string,
    opts?: { variantId?: string; manufacturerId?: number; fastMode?: boolean; resolution?: string },
  ): Promise<{ success: boolean; image?: string; error?: string }> => {
    const formData = new FormData()
    formData.append('vehicle_image', file)
    formData.append('product_id', productId)
    if (opts?.variantId) formData.append('variant_id', opts.variantId)
    if (opts?.manufacturerId) formData.append('manufacturer_id', String(opts.manufacturerId))
    if (opts?.fastMode) formData.append('fast_mode', 'true')
    if (opts?.resolution) formData.append('resolution', opts.resolution)

    try {
      const res = await fetch(`${baseUrl}/api/v1/render/single`, {
        method: 'POST',
        headers: sessionHeaders(),
        body: formData,
      })

      if (!res.ok) throw new Error(`Render failed (${res.status})`)

      const blob = await res.blob()
      return { success: true, image: URL.createObjectURL(blob) }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  }

  const renderStream = async (
    file: File,
    products: Array<{ product_id: string; variant_id?: string }>,
    manufacturerId: number,
    events: RenderStreamEvents,
    signal?: AbortSignal,
  ): Promise<{ success: boolean; final_image?: string; detected_vehicle?: string; error?: string }> => {
    const formData = new FormData()
    formData.append('vehicle_image', file)

    const productsPayload = products.map(p => ({
      product_id: parseInt(p.product_id, 10),
      ...(p.variant_id ? { variant_id: parseInt(p.variant_id, 10) } : {}),
    }))
    formData.append('products', JSON.stringify(productsPayload))
    formData.append('manufacturer_id', String(manufacturerId))
    formData.append('fast_mode', 'true')
    formData.append('debug', 'true')
    if (_visitor) formData.append('visitor_id', _visitor.id)

    const state: { reported?: boolean } = {}

    try {
      const res = await fetch(`${baseUrl}/api/v1/render/chain/stream`, {
        method: 'POST',
        headers: renderHeaders(),
        body: formData,
        signal,
      })

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

      const result = await processSSEStream(res.body.getReader(), events, { detectVehicle: true, state })

      if (!result.image) {
        throw new Error('Stream ended before a complete image was received')
      }

      return { success: true, final_image: result.image, detected_vehicle: result.vehicle }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { success: false, error: 'Request cancelled' }
      }
      const error = e instanceof Error ? e.message : 'Unknown error'
      if (!state.reported) {
        events.onError?.(error)
        events.onProblem?.({ kind: 'fail' })
      }
      return { success: false, error }
    }
  }

  return {
    setSessionId,
    setVisitor,
    getVisitor,
    decodeToken,
    validateToken,
    fetchProduct,
    fetchVariants,
    fetchDefaultVariant,
    detectVehicle,
    fetchSimilarProducts,
    getProductThumbnailUrl,
    render,
    renderSingle,
    renderStream,
    submitQuote,
    submitLead,
    emailRenders,
    getEmailGate,
    getStorageUrl,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
