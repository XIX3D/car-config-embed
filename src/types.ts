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
}
