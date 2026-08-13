export interface JWTPayload {
  wheel_id?: string
  wrap_id?: string
  variant_ids?: string[]
  exp?: number
  iat?: number
}

export interface Manufacturer {
  id: number
  company_name: string
}

export interface Product {
  id: string
  name: string
  category?: string
  sku?: string
  manufacturer_id: number
  manufacturer?: Manufacturer
  reference_image_paths?: string[]
  orthographic_image?: string
  centerlock_image?: string
  finish?: string
  color_family?: string
  primary_color_hex?: string
  status?: string
  created_at?: string
}

export interface Variant {
  id: string
  product_id?: string
  variant_name: string
  variant_slug?: string
  variant_type?: string
  hex_color?: string
  prompt_finish?: string
  is_default?: boolean
  is_top_variant?: boolean
  display_order?: number
  reference_image?: string
  reference_image_paths?: string[]
  orthographic_image?: string
  centerlock_image?: string
}

export interface DecodeTokenResponse {
  valid: boolean
  manufacturer_id: number
  wrap: Product | null
  wheel: Product | null
  variant_ids: number[]
}

export interface ValidateTokenResponse {
  valid: boolean
  is_active?: boolean
  manufacturer_id?: number
  wrap_id?: number | null
  wheel_id?: number | null
  error?: string
}

export interface VehicleDetectionResult {
  make: string
  model: string
  year: string
  vehicle_type: VehicleType
  confidence: number
}

export interface SimilarProduct {
  id: string
  name: string
  category?: string
  finish?: string
}

export interface RenderResult {
  label: string
  variantId: string | null
  hexColor: string | null
  referenceImage: string | null
  image?: string
  error?: string
  success: boolean
  loading?: boolean
}

export interface VehicleInfo {
  make?: string
  model?: string
  year?: string
  vehicle_type?: VehicleType
}

export interface QuoteRequest {
  name: string
  email: string
  phone?: string
  message?: string
  vehicle_info?: VehicleInfo
  product_ids: number[]
  images?: string[]
  final_image_url?: string
  final_image_urls?: string[]
  manufacturer_id: number
}

export interface WidgetConfig {
  apiUrl: string
  wrapsUrl?: string
  brand?: string
}

export type ViewState = 'upload' | 'loading' | 'result' | 'quote' | 'success'

export type ButtonTheme = 'light' | 'dark'

export type ButtonSize = 'standard' | 'compact'

export interface LoadingStep {
  text: string
  duration: number
}

export type VehicleType = 'sedan' | 'coupe' | 'hatchback' | 'suv' | 'truck' | 'minivan' | 'convertible' | 'wagon'

export interface DebugTextPart {
  type: 'text'
  content: string
}

export interface DebugImagePart {
  type: 'image'
  mime_type: string
  size_bytes: number
  source?: string
}

export type DebugPart = DebugTextPart | DebugImagePart

export interface DebugData {
  parts: DebugPart[]
  missing_references?: string[]
}

export interface QuotaExceededError {
  error: string
  limit: number
  message: string
  retry_after_seconds: number
}

export interface EmailGateResponse {
  email_required: boolean
  free_sessions_used: number
  free_sessions_limit: number
}

/**
 * Two-pass (v2) pipeline events. See docs/plans/TWO_PASS_EMBED_PLAN.md.
 *
 * Pass 1 paints flat chroma sockets over the rims and is billed PER PHOTO, cached for the
 * session; pass 2 fills those sockets and is billed per render. That split is why the 2nd
 * and 3rd finishes a visitor tries are much faster than the 1st.
 */
export interface MaskStartedData {
  /** True when the session already has a mask for this photo — pass 1 is skipped entirely. */
  cached: boolean
}

export interface MaskCompleteData {
  gate_passed: boolean
  attempts: number
  duration_ms: number
  cached: boolean
  /** Chroma sockets found in the mask. */
  sockets: number
  /**
   * Present only when the socket count exceeds the wheels intake saw. This is the signature
   * of an INVENTED socket — a false chroma blob that gets filled with wheel — and it is the
   * one v2 failure invisible to every other gate, because compositing then treats those
   * pixels as legitimately model-owned. Surface it.
   */
  blob_count_warning?: string
}

export interface CompositeCompleteData {
  /**
   * Measured on the model's RAW output at a coarse grid, not on the delivered image. 2-3%
   * is normal and passes. Actual outside-socket change on the composited result is ~0.067%.
   * Show `outside_verdict` instead — this number reads like damage when it is not.
   */
  outside_change_pct: number
  residual_chroma_pct: number
  duration_ms: number
  outside_verdict: 'PASS' | 'REVIEW' | 'FAIL'
  socket_px: number
  written_px: number
}

/**
 * v2 failure payloads.
 *
 * These arrive JSON-encoded inside the `error` event's `message` string rather than as
 * top-level fields, because the backend routes them through the same SSE error writer v1
 * uses. Parse before reading — see `parseV2ErrorEvent` in utils/api.ts.
 */
export interface V2ErrorData {
  /**
   * `model_refused` and `mask_gate_failed` are terminal; `render_failed` is transport.
   * `audit_failed` is the Gemini post-check rejecting the composited image — a model
   * judgement on model output, so it genuinely can pass on a second attempt.
   */
  error: 'model_refused' | 'render_failed' | 'mask_gate_failed' | 'audit_failed'
  message: string
  stage?: 'mask' | 'fill'
  /**
   * Absent on mask_gate_failed, which is never retryable. Treat absence as false: a
   * refusal returns identical bytes next time, so retrying spends money to fail again.
   */
  retryable?: boolean
  /** Why the mask gate rejected the photo, on `mask_gate_failed`. */
  reasons?: string[]
}

export interface RenderStreamEvents {
  onStarted?: () => void
  onVehicleDetected?: (data: { make: string; model: string; year: string; vehicle_type: VehicleType }) => void
  onProgress?: (data: { step: number; total: number; product_name: string }) => void
  onStepComplete?: (data: { image_b64: string }) => void
  onDebug?: (data: DebugData) => void
  onComplete?: (data: { image_b64: string }) => void
  onError?: (message: string) => void
  onQuotaExceeded?: (data: QuotaExceededError) => void
  onEmailGateRequired?: (data: EmailGateResponse) => void

  // v2-only. All optional, so v1 call sites need no changes and the `latest` bundle is
  // unaffected.
  onMaskStarted?: (data: MaskStartedData) => void
  onMaskComplete?: (data: MaskCompleteData) => void
  onFillStarted?: () => void
  onCompositeComplete?: (data: CompositeCompleteData) => void
  /** Fires instead of onError when the failure carries a structured v2 payload. */
  onV2Error?: (data: V2ErrorData) => void
}
