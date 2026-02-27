# HTML Attributes

Configure buttons using `data-*` attributes.

## Required Attributes

### data-jwt

**Required.** JWT token containing product configuration.

```html
<button class="avacar-preview" data-jwt="eyJhbGci..."></button>
```

## Optional Attributes

### data-brand

Brand name displayed in the modal header.

```html
<button
  class="avacar-preview"
  data-jwt="..."
  data-brand="Acme Wheels">
</button>
```

### data-text

Button text. Defaults to "Preview on Your Car".

```html
<button
  class="avacar-preview"
  data-jwt="..."
  data-text="See It On Your Ride">
</button>
```

Alternative: Set the text content of the element:

```html
<button class="avacar-preview" data-jwt="...">
  Custom Button Text
</button>
```

### data-size

Button size variant.

| Value | Description |
|-------|-------------|
| `standard` | Default size (recommended) |
| `compact` | Smaller button for tight spaces |

```html
<button
  class="avacar-preview"
  data-jwt="..."
  data-size="compact">
</button>
```

### data-button-theme

Force a specific button theme.

| Value | Description |
|-------|-------------|
| `light` | Light theme (dark text on light bg) |
| `dark` | Dark theme (light text on dark bg) |

```html
<button
  class="avacar-preview"
  data-jwt="..."
  data-button-theme="dark">
</button>
```

If not specified, the widget auto-detects based on:
1. `.dark` class on `<html>` or `<body>`
2. `prefers-color-scheme` media query

### data-styled

Whether to apply default button styles.

| Value | Description |
|-------|-------------|
| `true` | (default) Widget renders a styled button |
| `false` | Widget only attaches click handler |

```html
<!-- Styled (default) -->
<button
  class="avacar-preview"
  data-jwt="..."
  data-styled="true">
</button>

<!-- Custom styling -->
<button
  class="avacar-preview my-custom-class"
  data-jwt="..."
  data-styled="false">
  My Custom Button
</button>
```

## Full Example

```html
<button
  class="avacar-preview"
  data-jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  data-brand="Premium Wheels"
  data-text="Preview on Your Car"
  data-size="standard"
  data-button-theme="light"
  data-styled="true">
</button>
```

## Class Requirement

Buttons must have `class="avacar-preview"` to be auto-detected:

```html
<!-- Will be detected -->
<button class="avacar-preview" data-jwt="..."></button>
<button class="avacar-preview my-class" data-jwt="..."></button>

<!-- Will NOT be detected -->
<button class="my-button" data-jwt="..."></button>
```

For non-auto-detected buttons, use the JavaScript API:

```javascript
AvaCar.createButton(container, jwt, options)
```

## Dynamic Buttons

Buttons added after page load are automatically detected via MutationObserver. You can also manually trigger binding:

```javascript
// Add button dynamically
const btn = document.createElement('button')
btn.className = 'avacar-preview'
btn.setAttribute('data-jwt', 'token...')
document.body.appendChild(btn)

// Binding happens automatically, or call manually:
AvaCar.bindButtons()
```
