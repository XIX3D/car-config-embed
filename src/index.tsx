import { render } from 'solid-js/web'
import { createSignal, onCleanup } from 'solid-js'
import widgetStyles from './styles/index.css?inline'

import { Modal } from './components/Modal'
import { ZenoButton } from './components/ZenoButton'
import { createWidgetStore } from './stores/widget-store'
import { createApiClient } from './utils/api'
import { renderStreamV2 } from './utils/api-v2'
import { V2_LOADING_SCRIPTS } from './config/loading-v2'
import { decodeJWT } from './utils/jwt'
import { createSession } from './utils/session'
import { detectTheme, observeThemeChanges } from './utils/theme'
import { debugWarn } from './utils/debug'
import type { ButtonTheme, ButtonSize, WidgetConfig, EmailGateResponse } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.platform.xix3d.com'

const FAIL_CLOSED_GATE: EmailGateResponse = {
  email_required: true,
  free_sessions_used: 0,
  free_sessions_limit: 0,
}

const store = createWidgetStore()
const baseApi = createApiClient(API_URL)

store.actions.enableV2Loading(V2_LOADING_SCRIPTS)

/**
 * The X-Session-ID of the open preview. v2 keys its wheel-outline (pass 1) cache on it, so
 * every finish tried on one photo in one preview reuses the first finish's outline.
 */
let sessionId = ''

/**
 * Serialises v2 renders. The modal fires one request per selected finish at once; run
 * concurrently, each would miss the outline cache and pay pass 1 again (~14 s and a model
 * call). Queued, the first builds it and the rest reuse it.
 */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)

  // Keep the chain alive when a render rejects, or one failure stalls every finish behind it.
  queue = run.catch(() => {})

  return run
}

type RenderProducts = Array<{ product_id: string; variant_id?: string }>

/**
 * Wheels render through the two-pass (v2) pipeline, the one render.xix3D runs. v2 takes
 * exactly one wheel product per request, so wraps and wheel + wrap combinations stay on the
 * single-pass route.
 */
const rendersOnV2 = (products: RenderProducts) => products.length === 1 && !store.state.isWraps

function renderOnV2(
  file: File,
  products: RenderProducts,
  manufacturerId: number,
  events: Parameters<typeof baseApi.renderStream>[3],
  signal?: AbortSignal,
) {
  return enqueue(() => renderStreamV2(
    API_URL,
    sessionId,
    file,
    {
      product_id: parseInt(products[0].product_id, 10),
      ...(products[0].variant_id ? { variant_id: parseInt(products[0].variant_id, 10) } : {}),
    },
    manufacturerId,
    events,
    signal,
  ))
}

const api: typeof baseApi = {
  ...baseApi,

  setSessionId: (id) => {
    sessionId = id
    baseApi.setSessionId(id)
  },

  renderStream: async (file, products, manufacturerId, events, signal) => {
    if (!rendersOnV2(products)) return baseApi.renderStream(file, products, manufacturerId, events, signal)

    const result = await renderOnV2(file, products, manufacturerId, events, signal)

    return { success: result.success, final_image: result.image, error: result.error }
  },

  renderSingleVariant: async (file, products, manufacturerId, events, signal) => {
    if (!rendersOnV2(products)) return baseApi.renderSingleVariant(file, products, manufacturerId, events, signal)

    const result = await renderOnV2(file, products, manufacturerId, events, signal)

    return { success: result.success, image: result.image, error: result.error }
  },
}

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
    const gate = await api.getEmailGate(product?.manufacturer_id)

    store.actions.setEmailGate(gate ?? FAIL_CLOSED_GATE)

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
  const gate = await api.getEmailGate(product?.manufacturer_id)

  store.actions.setEmailGate(gate ?? FAIL_CLOSED_GATE)
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

    // The button is hidden up front so the brand's own markup does not flash
    // before the styled replacement renders. Every path that gives up after
    // this point MUST put it back, or the brand's call to action silently
    // disappears from their live site with nothing logged anywhere.
    //
    // That was the old behaviour: a cold start, a network blip, a non-2xx or a
    // CORS failure all left the button hidden forever, and it looked identical
    // to hitting the monthly render cap. Nobody could tell an outage from a
    // quota, because neither said anything.
    //
    // Restoring it bare would be worse than useless (a visible button that
    // does nothing), so the fallback also binds a click that just opens the
    // preview. Validation runs again inside that flow, which means a load-time
    // failure that has since recovered, exactly what a Cloud Run cold start
    // looks like, resolves itself the moment a customer actually clicks.
    let fallbackBound = false
    const restoreButton = (why: string) => {
      if (fallbackBound) return
      fallbackBound = true
      console.warn(`[avacar] preview button could not be initialised (${why}); leaving the original button in place`)
      button.style.display = originalDisplay
      button.addEventListener('click', (e) => {
        e.preventDefault()
        openPreview(jwt, customBrand)
      })
    }

    if (!decodeJWT(jwt)) {
      restoreButton('malformed token')

      return
    }

    api.validateToken(jwt).then((result) => {
      if (!result) {
        restoreButton('token validation returned no result')

        return
      }
      // The one deliberate removal: this account is switched off, so the brand
      // is meant to lose the button. Everything else is a failure, not a state.
      if (result.is_active === false) {
        debugWarn(
          'button removed: this embed token is deactivated (is_active: false). The token is '
          + 'valid but switched off server-side.',
        )
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
        fallbackBound = true
        button.style.display = originalDisplay
        button.addEventListener('click', (e) => {
          e.preventDefault()
          openPreview(jwt, customBrand)
        })
      }
    }).catch((err) => {
      restoreButton(`validation threw: ${err}`)
    })
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
