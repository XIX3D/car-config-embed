# Playground

Try the AvaCar widget with live code editing. Changes update the preview in real-time.

<Playground />

## JWT Decoder

Inspect and validate JWT tokens:

<JwtDecoder />

## Example Configurations

### Minimal Setup

```html
<button class="avacar-preview" data-jwt="YOUR_TOKEN"></button>
```

### Custom Branding

```html
<button
  class="avacar-preview"
  data-jwt="YOUR_TOKEN"
  data-brand="Acme Wheels"
  data-text="See It On Your Ride">
</button>
```

### Compact Dark Button

```html
<button
  class="avacar-preview"
  data-jwt="YOUR_TOKEN"
  data-size="compact"
  data-button-theme="dark">
</button>
```

### Unstyled (Custom Button)

```html
<button
  class="avacar-preview my-custom-button"
  data-jwt="YOUR_TOKEN"
  data-styled="false">
  Custom Button Text
</button>
```

With `data-styled="false"`, the widget attaches a click handler but doesn't replace your button.

### Programmatic Open

```html
<button onclick="AvaCar.open('YOUR_TOKEN', 'Brand')">
  Open Preview
</button>
```
