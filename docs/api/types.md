# TypeScript Types

All types used by the AvaCar widget.

## Core Types

### JWTPayload

JWT token payload structure.

```typescript
interface JWTPayload {
  wheel_id?: string
  wrap_id?: string
  variant_ids?: string[]
  exp?: number
  iat?: number
}
```

| Field | Type | Description |
|-------|------|-------------|
| `wheel_id` | string | Wheel product ID (mutually exclusive with wrap_id) |
| `wrap_id` | string | Wrap product ID (mutually exclusive with wheel_id) |
| `variant_ids` | string[] | Allowed variant IDs for this token |
| `exp` | number | Expiration timestamp (Unix seconds) |
| `iat` | number | Issued at timestamp (Unix seconds) |

### Product

Product information from the API.

```typescript
interface Product {
  id: string
  name: string
  category?: string
  thumbnail_url?: string
}
```

### Variant

Product variant (color/finish option).

```typescript
interface Variant {
  id: string
  variant_name: string
  hex_color?: string
  reference_image?: string
}
```

### RenderResult

Result from the render API.

```typescript
interface RenderResult {
  label: string
  variantId: string | null
  hexColor: string | null
  referenceImage: string | null
  image?: string
  error?: string
  success: boolean
}
```

### Customer

Customer information for quote requests.

```typescript
interface Customer {
  name: string
  email: string
  phone?: string
  zip_code: string
}
```

### QuoteRequest

Quote submission payload.

```typescript
interface QuoteRequest {
  customer: Customer
  vehicle: string
  product_id: string
  variant_ids: string[]
  rendered_image: string
}
```

## Configuration Types

### WidgetConfig

Widget configuration options.

```typescript
interface WidgetConfig {
  apiUrl: string
  wrapsUrl?: string
  brand?: string
}
```

### ButtonTheme

Button color theme.

```typescript
type ButtonTheme = 'light' | 'dark'
```

### ButtonSize

Button size variant.

```typescript
type ButtonSize = 'standard' | 'compact'
```

## Internal Types

### ViewState

Modal view states.

```typescript
type ViewState = 'upload' | 'loading' | 'result' | 'quote' | 'success'
```

### LoadingStep

Loading animation step.

```typescript
interface LoadingStep {
  text: string
  duration: number
}
```

## Usage Example

```typescript
import type { JWTPayload, Product, Variant } from 'car-config-embed'

function processToken(payload: JWTPayload): void {
  const productId = payload.wheel_id || payload.wrap_id
  console.log('Product:', productId)
  console.log('Variants:', payload.variant_ids)
}

function displayProduct(product: Product, variants: Variant[]): void {
  console.log(product.name)
  variants.forEach(v => console.log(`- ${v.variant_name}: ${v.hex_color}`))
}
```
