import type { Product, Variant, QuoteRequest } from '../types'

export function createApiClient(baseUrl: string) {
  const fetchProduct = async (productId: string): Promise<Product | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/products/${productId}`)
      const data = await res.json()

      return data.success ? data.product : null
    } catch {
      return null
    }
  }

  const fetchVariants = async (
    productId: string,
    allowedIds?: string[],
  ): Promise<Variant[]> => {
    try {
      const res = await fetch(`${baseUrl}/api/variants/product/${productId}`)
      const data = await res.json()

      if (!data.success) return []
      let variants = data.variants as Variant[]

      if (allowedIds?.length) {
        variants = variants.filter((v) => allowedIds.includes(v.id))
      }

      return variants
    } catch {
      return []
    }
  }

  const render = async (
    file: File,
    products: Array<{ product_id: string; variant_id?: string }>,
  ): Promise<{ success: boolean; final_image?: string; detected_vehicle?: string; error?: string }> => {
    const formData = new FormData()

    formData.append('vehicle_image', file)
    formData.append('products', JSON.stringify(products))

    try {
      const res = await fetch(`${baseUrl}/api/render`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.success && data.final_image) {
        return data
      }
      throw new Error(data.error || 'Failed to generate')
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
  }

  const submitQuote = async (request: QuoteRequest): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${baseUrl}/api/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      return await res.json()
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const getProductThumbnailUrl = (productId: string) =>
    `${baseUrl}/api/products/${productId}/thumbnail`

  const getStorageUrl = (path: string) =>
    `${baseUrl}/storage/${path}`

  return {
    fetchProduct,
    fetchVariants,
    render,
    submitQuote,
    getProductThumbnailUrl,
    getStorageUrl,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
