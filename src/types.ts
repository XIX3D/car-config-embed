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
  thumbnail_url?: string
}

export interface Variant {
  id: string
  variant_name: string
  hex_color?: string
  reference_image?: string
}

export interface RenderResult {
  label: string
  variantId: string | null
  hexColor: string | null
  referenceImage: string | null
  image?: string
  error?: string
  success: boolean
}

export interface Customer {
  name: string
  email: string
  phone?: string
  zip_code: string
}

export interface QuoteRequest {
  customer: Customer
  vehicle: string
  product_id: string
  variant_ids: string[]
  rendered_image: string
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
