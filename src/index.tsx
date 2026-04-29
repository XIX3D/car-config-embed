import { render } from 'solid-js/web'
import { createSignal, onCleanup } from 'solid-js'
import widgetStyles from './styles/index.css?inline'

import { Modal } from './components/Modal'
import { ZenoButton } from './components/ZenoButton'
import { createWidgetStore } from './stores/widget-store'
import { createApiClient } from './utils/api'
import { decodeJWT } from './utils/jwt'
import { createSession } from './utils/session'
import { detectTheme, observeThemeChanges } from './utils/theme'
import type { ButtonTheme, ButtonSize, WidgetConfig } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.platform.xix3d.com'

const store = createWidgetStore()
const api = createApiClient(API_URL)

let rootEl: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
const boundButtons = new WeakSet<Element>()

function injectButtonStyles() {
  if (document.getElementById('avacar-button-styles')) return

  const styleEl = document.createElement('style')
  styleEl.id = 'avacar-button-styles'
  styleEl.textContent = widgetStyles
  document.head.appendChild(styleEl)
}

function mountWidget() {
  if (rootEl) return

  rootEl = document.createElement('div')
  rootEl.id = 'avacar-embed-root'
  document.body.appendChild(rootEl)

  shadowRoot = rootEl.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = widgetStyles
  shadowRoot.appendChild(styleEl)

  const mountPoint = document.createElement('div')
  shadowRoot.appendChild(mountPoint)

  render(() => <Modal store={store} api={api} shadowRoot={shadowRoot!} />, mountPoint)
}

async function openPreview(jwt: string, customBrand?: string) {
  if (!jwt) {
    console.error('Avacar: No JWT token provided')

    return
  }

  mountWidget()

  api.setSessionId(createSession())

  const decodeResult = await api.decodeToken(jwt)

  if (decodeResult?.valid) {
    const product = decodeResult.wheel || decodeResult.wrap
    const productId = product?.id
    const variantIds = decodeResult.variant_ids?.map(String) || []

    const selections = {
      wheel_id: decodeResult.wheel?.id,
      wrap_id: decodeResult.wrap?.id,
      variant_ids: variantIds,
    }

    let variants: Awaited<ReturnType<typeof api.fetchVariants>> = []

    if (productId) {
      variants = await api.fetchVariants(productId, variantIds)
    }

    store.actions.open(selections, product, variants, customBrand)
    return
  }

  const selections = decodeJWT(jwt)

  if (!selections) {
    console.error('Avacar: Invalid JWT token')

    return
  }

  const productId = selections.wheel_id || selections.wrap_id
  const allowedVariantIds = selections.variant_ids || []

  let product = null
  let variants: Awaited<ReturnType<typeof api.fetchVariants>> = []

  if (productId) {
    const [p, v] = await Promise.all([
      api.fetchProduct(productId),
      api.fetchVariants(productId, allowedVariantIds),
    ])

    product = p
    variants = v
  }

  store.actions.open(selections, product, variants, customBrand)
}

function createZenoButton(
  container: HTMLElement,
  jwt: string,
  options?: {
    text?: string
    theme?: ButtonTheme
    size?: ButtonSize
    brand?: string
  },
) {
  const [theme, setTheme] = createSignal<ButtonTheme>(options?.theme || detectTheme(container))

  const cleanup = observeThemeChanges(() => {
    if (!options?.theme) {
      setTheme(detectTheme(container))
    }
  })

  render(
    () => (
      <ZenoButton
        text={options?.text}
        theme={theme()}
        size={options?.size}
        onClick={() => openPreview(jwt, options?.brand)}
      />
    ),
    container,
  )

  onCleanup(cleanup)
}

function bindButtons() {
  const buttons = document.querySelectorAll<HTMLElement>('.avacar-preview[data-jwt]')

  buttons.forEach((button) => {
    if (boundButtons.has(button)) return
    boundButtons.add(button)

    const jwt = button.getAttribute('data-jwt')

    if (!jwt) return

    const customBrand = button.getAttribute('data-brand') || undefined
    const buttonText = button.textContent?.trim() || button.getAttribute('data-text') || 'Preview on Your Car'
    const useDefaultStyle = button.getAttribute('data-styled') !== 'false'
    const size = (button.getAttribute('data-size') as ButtonSize) || 'standard'
    const explicitTheme = button.getAttribute('data-button-theme') as ButtonTheme | null

    const originalDisplay = button.style.display
    button.style.display = 'none'

    if (!decodeJWT(jwt)) return

    api.validateToken(jwt).then((result) => {
      if (!result) return
      if (result.is_active === false) {
        button.remove()
        return
      }

      if (useDefaultStyle) {
        const theme = explicitTheme || detectTheme(button)
        const wrapper = document.createElement('div')

        button.parentNode?.insertBefore(wrapper, button)

        render(
          () => (
            <ZenoButton
              text={buttonText}
              theme={theme}
              size={size}
              onClick={() => openPreview(jwt, customBrand)}
            />
          ),
          wrapper,
        )

        const btn = wrapper.querySelector('.avacar-btn-zeno')

        if (btn) {
          btn.setAttribute('data-jwt', jwt)
          if (explicitTheme) {
            btn.setAttribute('data-theme-locked', 'true')
          }
        }
      } else {
        button.style.display = originalDisplay
        button.addEventListener('click', (e) => {
          e.preventDefault()
          openPreview(jwt, customBrand)
        })
      }
    }).catch(() => {})
  })
}

function updateAllHoloButtonThemes() {
  // kept for backward compatibility — new button design has no theme variants
}

function init() {
  injectButtonStyles()
  mountWidget()
  api.setSessionId(createSession())
  bindButtons()

  const buttonObserver = new MutationObserver(() => {
    bindButtons()
  })

  buttonObserver.observe(document.body, { childList: true, subtree: true })

  observeThemeChanges(updateAllHoloButtonThemes)

  const scripts = document.querySelectorAll<HTMLScriptElement>('script[data-jwt]')

  if (scripts.length) {
    const script = scripts[scripts.length - 1]
    const jwt = script.getAttribute('data-jwt')

    if (jwt) {
      (window as unknown as Record<string, unknown>).showPreview = () => openPreview(jwt)
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

const AvaCar = {
  open: openPreview,
  bindButtons,
  updateThemes: updateAllHoloButtonThemes,
  createButton: createZenoButton,
}

;(window as unknown as Record<string, unknown>).AvaCar = AvaCar

export { AvaCar, openPreview, bindButtons, updateAllHoloButtonThemes, createZenoButton }
export type { WidgetConfig, ButtonTheme, ButtonSize }
