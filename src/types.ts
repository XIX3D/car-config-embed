export interface JWTPayload {
  wheel_id?: string
  wrap_id?: string
  variant_ids?: string[]
  exp?: number
  iat?: number
}

export interface Product {
  id: string
  name: string
  category?: string
  manufacturer_id: number
  reference_image_paths?: string[]
  orthographic_image?: string
}

export interface Variant {
  id: string
  variant_name: string
  hex_color?: string
  reference_image?: string
  reference_image_paths?: string[]
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

export interface RenderStreamEvents {
  onStarted?: () => void
  onVehicleDetected?: (data: { make: string; model: string; year: string; vehicle_type: VehicleType }) => void
  onProgress?: (data: { step: number; total: number; product_name: string }) => void
  onStepComplete?: (data: { image_b64: string }) => void
  onComplete?: (data: { image_b64: string }) => void
  onError?: (message: string) => void
}
