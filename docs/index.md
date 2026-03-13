---
layout: home

hero:
  name: "AvaCar Widget"
  text: "Car Customization Preview"
  tagline: Let customers preview wheels and wraps on their own vehicles
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Try Playground
      link: /playground

features:
  - title: Easy Integration
    details: Add a single script tag and HTML button to enable car customization previews on your site.
  - title: JWT-Based Configuration
    details: Securely pass product and variant selections using signed JWT tokens.
  - title: Responsive Design
    details: Automatically adapts to light/dark themes and works on all device sizes.
  - title: JavaScript API
    details: Full programmatic control with AvaCar.open(), createButton(), and more.
---

## Quick Start

```html
<!-- Add the widget script -->
<script src="https://github.com/XIX3D/car-config-embed/releases/download/latest/car-config-embed.iife.js"></script>

<!-- Add a preview button -->
<button
  class="avacar-preview"
  data-jwt="YOUR_JWT_TOKEN"
  data-brand="Your Brand">
</button>
```

The widget automatically binds to elements with `class="avacar-preview"` and `data-jwt` attributes.

## How It Works

1. **Generate JWT** - Create a signed token with product IDs and allowed variants
2. **Embed Button** - Add the widget script and button HTML to your page
3. **User Clicks** - Customer clicks the button to open the preview modal
4. **Upload Photo** - Customer uploads a photo of their vehicle
5. **See Preview** - AI renders the selected product on their car
6. **Request Quote** - Customer can request a quote directly from the widget
