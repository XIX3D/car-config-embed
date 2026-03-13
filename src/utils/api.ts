import type { Product, Variant, QuoteRequest, RenderStreamEvents } from '../types'

export function createApiClient(baseUrl: string) {
  const fetchProduct = async (productId: string): Promise<Product | null> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}`)
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
      const res = await fetch(`${baseUrl}/api/v1/products/${productId}/variants`)
      const data = await res.json()
      console.log('[DEBUG] fetchVariants response', data)

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
    console.log('[DEBUG] api.render called', { baseUrl, products })
    const formData = new FormData()

    formData.append('vehicle_image', file)
    formData.append('products', JSON.stringify(products))

    try {
      const res = await fetch(`${baseUrl}/api/v1/render/chain`, {
        method: 'POST',
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

  const submitQuote = async (request: QuoteRequest): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`${baseUrl}/api/v1/quote/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      return await res.json()
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    }
  }

  const getStorageUrl = (path: string) =>
    `${baseUrl}/storage/${path}`

  const renderStream = async (
    file: File,
    products: Array<{ product_id: string; variant_id?: string }>,
    events: RenderStreamEvents,
  ): Promise<{ success: boolean; final_image?: string; detected_vehicle?: string; error?: string }> => {
    const formData = new FormData()
    formData.append('vehicle_image', file)

    const productsPayload = products.map(p => ({
      product_id: parseInt(p.product_id, 10),
      ...(p.variant_id ? { variant_id: parseInt(p.variant_id, 10) } : {}),
    }))
    formData.append('products', JSON.stringify(productsPayload))
    formData.append('fast_mode', 'true')

    try {
      const res = await fetch(`${baseUrl}/api/v1/render/chain/stream`, {
        method: 'POST',
        body: formData,
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
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
              events.onStarted?.()
              break
            case 'vehicle_detected':
              detectedVehicle = `${data.year} ${data.make} ${data.model}`
              events.onVehicleDetected?.(data)
              break
            case 'progress':
              events.onProgress?.(data)
              break
            case 'step_complete':
              events.onStepComplete?.(data)
              break
            case 'complete':
              finalImage = `data:image/png;base64,${data.image_b64}`
              events.onComplete?.(data)
              break
            case 'error':
              events.onError?.(data.message)
              return { success: false, error: data.message }
          }
        }
      }

      return { success: true, final_image: finalImage, detected_vehicle: detectedVehicle }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error'
      events.onError?.(error)
      return { success: false, error }
    }
  }

  return {
    fetchProduct,
    fetchVariants,
    render,
    renderStream,
    submitQuote,
    getStorageUrl,
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
