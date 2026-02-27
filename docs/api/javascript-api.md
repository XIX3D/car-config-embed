# JavaScript API

The widget exposes a global `AvaCar` object with methods for programmatic control.

## Methods

### AvaCar.open(jwt, brand?)

Opens the preview modal with the specified JWT token.

```typescript
AvaCar.open(jwt: string, brand?: string): Promise<void>
```

**Parameters:**
- `jwt` - JWT token containing product configuration
- `brand` - Optional brand name displayed in the modal

**Example:**

```javascript
// Basic usage
AvaCar.open('eyJhbGci...')

// With brand
AvaCar.open('eyJhbGci...', 'Acme Wheels')
```

### AvaCar.createButton(container, jwt, options?)

Creates a styled button inside a container element.

```typescript
AvaCar.createButton(
  container: HTMLElement,
  jwt: string,
  options?: {
    text?: string
    theme?: 'light' | 'dark'
    size?: 'standard' | 'compact'
    brand?: string
  }
): void
```

**Parameters:**
- `container` - DOM element to render the button into
- `jwt` - JWT token containing product configuration
- `options.text` - Button text (default: "Preview on Your Car")
- `options.theme` - Button theme, auto-detected if not specified
- `options.size` - Button size (default: "standard")
- `options.brand` - Brand name for the modal

**Example:**

```javascript
const container = document.getElementById('button-container')

AvaCar.createButton(container, 'eyJhbGci...', {
  text: 'Preview Wheels',
  theme: 'dark',
  size: 'compact',
  brand: 'Premium Wheels'
})
```

### AvaCar.bindButtons()

Finds and binds all unbound `.avacar-preview[data-jwt]` elements.

```typescript
AvaCar.bindButtons(): void
```

Called automatically on page load and when DOM changes. Call manually after dynamically adding buttons.

**Example:**

```javascript
// After adding buttons via JavaScript
document.body.innerHTML += `
  <button class="avacar-preview" data-jwt="token">Preview</button>
`
AvaCar.bindButtons()
```

### AvaCar.updateThemes()

Updates button themes based on current page color scheme.

```typescript
AvaCar.updateThemes(): void
```

Called automatically when system theme changes. Call manually after changing your page's theme.

**Example:**

```javascript
// After toggling dark mode
document.documentElement.classList.toggle('dark')
AvaCar.updateThemes()
```

## Auto-Initialization

The widget automatically:

1. Mounts the modal container on load
2. Binds all `.avacar-preview[data-jwt]` buttons
3. Observes DOM for new buttons
4. Updates themes on system preference change

## TypeScript Types

```typescript
type ButtonTheme = 'light' | 'dark'
type ButtonSize = 'standard' | 'compact'

interface WidgetConfig {
  apiUrl: string
  wrapsUrl?: string
  brand?: string
}
```

See [TypeScript Types](/api/types) for all type definitions.
