# Getting Started

This guide walks you through integrating the AvaCar widget into your website.

## Installation

### CDN (Recommended)

Add the script to your HTML:

```html
<script src="https://github.com/XIX3D/car-config-embed/releases/download/v0.0.1/car-config-embed.iife.js"></script>
```

The script auto-initializes and binds to any buttons with `class="avacar-preview"`.

### Self-Hosted

1. Download `car-config-embed.iife.js` from the releases
2. Host it on your server
3. Include it in your HTML:

```html
<script src="/path/to/car-config-embed.iife.js"></script>
```

## Basic Usage

### HTML Attributes (Declarative)

The simplest way to add a preview button:

```html
<button
  class="avacar-preview"
  data-jwt="YOUR_JWT_TOKEN"
  data-brand="Your Brand"
  data-text="Preview on Your Car"
  data-size="standard"
  data-button-theme="light">
</button>
```

The widget replaces this element with a styled button.

### JavaScript API (Programmatic)

For more control, use the JavaScript API:

```javascript
// Open the preview modal directly
AvaCar.open('YOUR_JWT_TOKEN', 'Your Brand')

// Create a button in a container
AvaCar.createButton(
  document.getElementById('button-container'),
  'YOUR_JWT_TOKEN',
  {
    text: 'Preview on Your Car',
    theme: 'dark',
    size: 'standard',
    brand: 'Your Brand'
  }
)

// Manually bind buttons (called automatically on load)
AvaCar.bindButtons()

// Update button themes when page theme changes
AvaCar.updateThemes()
```

## JWT Token

The JWT token contains:

- `wheel_id` or `wrap_id` - Product identifier
- `variant_ids` - Array of allowed variant IDs
- `exp` - Expiration timestamp
- `iat` - Issued at timestamp

See [JWT Structure](/integration/jwt) for details.

## Configuration Options

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-jwt` | string | required | JWT token with product config |
| `data-brand` | string | - | Brand name shown in modal |
| `data-text` | string | "Preview on Your Car" | Button text |
| `data-size` | "standard" \| "compact" | "standard" | Button size |
| `data-button-theme` | "light" \| "dark" | auto | Button theme |
| `data-styled` | "true" \| "false" | "true" | Use default button styles |

## Theme Detection

By default, the widget detects your page's color scheme:

- Checks for `.dark` class on `<html>` or `<body>`
- Checks `prefers-color-scheme` media query
- Updates automatically when theme changes

Override with `data-button-theme="light"` or `data-button-theme="dark"`.

## Next Steps

- [Playground](/playground) - Interactive code editor
- [JavaScript API](/api/javascript-api) - Full API reference
- [HTML Attributes](/integration/html-attributes) - All attribute options
- [JWT Structure](/integration/jwt) - Token format and generation
