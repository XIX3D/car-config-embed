/**
 * Two-pass (v2) widget entry point — FOR COMPARISON TESTING ONLY.
 *
 * WHY THIS IS A SEPARATE ENTRY
 *
 * `latest`, the artifact every embedded customer site loads, is built from src/index.tsx and
 * must not contain v2 code. Two earlier attempts to gate v2 from inside that entry both
 * failed, and it is worth recording why so nobody retries them:
 *
 *   1. A method on the API client. `createApiClient` is constructed unconditionally, so
 *      nothing proves the method dead and the minifier keeps it.
 *   2. A build-time flag guarding an import. `VITE_PIPELINE_ALLOWED` is parsed at runtime
 *      (a `.split()` on an env string), so `isPipelineAvailable('v2')` is NOT a static
 *      constant and cannot fold a branch away. A dynamic import fares no better —
 *      `vite.config.ts` sets `inlineDynamicImports: true`, which pulls it into the same IIFE.
 *
 * A second entry sidesteps all of it: src/index.tsx never imports this file, so v2 cannot
 * reach the production bundle regardless of what the minifier decides. The isolation is
 * structural, and tools/check-bundle-isolation.mjs verifies it on both artifacts.
 *
 * WHAT DIFFERS FROM v1 AT RUNTIME
 *
 * Only the render call. Token decode, variant fetch, quotes and the email gate all still go
 * to the v1 API, because v2 is a render pipeline and nothing else. The v2 host serves only
 * the render endpoint.
 */
import { render } from 'solid-js/web'
import widgetStyles from './styles/index.css?inline'

import { Modal } from './components/Modal'
import { ZenoButton } from './components/ZenoButton'
import { createWidgetStore } from './stores/widget-store'
import { createApiClient } from './utils/api'
import { renderStreamV2 } from './utils/api-v2'
import { V2_LOADING_SCRIPTS } from './config/loading-v2'
import { decodeJWT } from './utils/jwt'
import { createSession } from './utils/session'
import { detectTheme } from './utils/theme'
import { debugError, debugWarn, debugTrace } from './utils/debug'
import type {
  ButtonTheme,
  ButtonSize,
  EmailGateResponse,
  RenderStreamEvents,
} from './types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.platform.xix3d.com'
const API_URL_V2 = import.meta.env.VITE_API_URL_V2
  || 'https://carconfig-api-v2test-rwqpwbfxnq-uc.a.run.app'

const FAIL_CLOSED_GATE: EmailGateResponse = {
  email_required: true,
  free_sessions_used: 0,
  free_sessions_limit: 0,
}

const store = createWidgetStore()
const baseApi = createApiClient(API_URL)

// Real SSE stages drive the loading text on v2. Without this the display would run v1's
// ~18s script against a ~45s render, finish early and sit frozen for ~27s — which reads as
// a hung widget rather than a slow one.
store.actions.enableV2Loading(V2_LOADING_SCRIPTS)

/**
 * The session UUID, shared by every render in this browsing session.
 *
 * This is what makes sequential finishes cheap: the backend keys its mask cache on
 * session + photo, so finish 2 and 3 skip pass 1 entirely (~14s and one model call each).
 * It MUST stay a UUID — anything else is silently replaced per request, and the only symptom
 * is that every render quietly pays full price.
 */
const sessionId = createSession()

baseApi.setSessionId(sessionId)

let rootEl: HTMLElement | null = null
let shadowRoot: ShadowRoot | null = null
const boundButtons = new WeakSet<Element>()

/**
 * Reject what v2 cannot render, before a request is sent.
 *
 * Both constraints are enforced server-side too, but failing here means the user finds out
 * on click rather than after choosing a photo and waiting for an upload.
 */
function v2Rejection(productCount: number): string | null {
  if (store.state.isWraps) {
    return 'The two-pass pipeline renders wheels only. This token is for wraps — test it on the v1 side.'
  }

  if (productCount > 1) {
    return 'The two-pass pipeline takes one product per request. This token selects several.'
  }

  return null
}

/**
 * Serialises v2 renders.
 *
 * The modal fires one `renderStream` per selected finish, all at once — correct for v1, wrong
 * for v2. Concurrent requests would each check the mask cache before any had populated it, so
 * all three would build their own mask: the full ~45s and an extra model call every time,
 * three times over.
 *
 * Queueing them makes the first render build the mask (~45s) and the rest reuse it (~30s),
 * which is exactly the behaviour the backend's session cache was designed for. The modal is
 * unchanged and unaware; its gallery slots simply fill in one after another.
 */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task)

  // Keep the chain alive even when a render rejects, or one failure would stall every
  // finish behind it.
  queue = run.catch(() => {})

  return run
}

/** One v2 render. Shared by both render methods, which differ only in what they return. */
async function renderOne(
  file: File,
  products: Array<{ product_id: string; variant_id?: string }>,
  manufacturerId: number,
  events: RenderStreamEvents,
) {
  return renderStreamV2(
    API_URL_V2,
    sessionId,
    file,
    {
      product_id: parseInt(products[0].product_id, 10),
      ...(products[0].variant_id ? { variant_id: parseInt(products[0].variant_id, 10) } : {}),
    },
    manufacturerId,
    events,
  )
}

/**
 * The v1 client with its two render methods swapped for v2 ones.
 *
 * Everything else still talks to the v1 API — v2 is a render pipeline, and its host serves
 * only that endpoint. Keeping the same shape means Modal.tsx is unchanged between pipelines,
 * so the comparison tests the render, not two different UIs.
 *
 * Neither method retries. Request bytes are identical next time, and the backend measured one
 * combination refusing 12 consecutive times; only `render_failed` is retryable and that is
 * the user's call, not a silent loop. `renderStreamV2` already reports retryability through
 * `onV2Error`.
 */
const api: typeof baseApi = {
  ...baseApi,

  renderStream: async (file, products, manufacturerId, events) => {
    const rejection = v2Rejection(products.length)

    if (rejection) {
      events.onError?.(rejection)

      return { success: false, error: rejection }
    }

    const result = await enqueue(() => renderOne(file, products, manufacturerId, events))

    return {
      success: result.success,
      final_image: result.image,
      error: result.error,
    }
  },

  renderSingleVariant: async (file, products, manufacturerId, events) => {
    const rejection = v2Rejection(products.length)

    if (rejection) {
      events.onError?.(rejection)

      return { success: false, error: rejection }
    }

    const result = await enqueue(() => renderOne(file, products, manufacturerId, events))

    return { success: result.success, image: result.image, error: result.error }
  },
}

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
    console.error('Avacar v2: No JWT token provided')

    return
  }

  mountWidget()

  const decodeResult = await baseApi.decodeToken(jwt)

  if (decodeResult?.valid) {
    const product = decodeResult.wheel || decodeResult.wrap
    const productId = product?.id
    const variantIds = decodeResult.variant_ids?.map(String) || []

    const selections = {
      wheel_id: decodeResult.wheel?.id,
      wrap_id: decodeResult.wrap?.id,
      variant_ids: variantIds,
    }

    let variants: Awaited<ReturnType<typeof baseApi.fetchVariants>> = []

    if (productId) {
      variants = await baseApi.fetchVariants(productId, variantIds)
    }

    store.actions.open(selections, product, variants, customBrand)
    const gate = await baseApi.getEmailGate(product?.manufacturer_id)

    store.actions.setEmailGate(gate ?? FAIL_CLOSED_GATE)

    return
  }

  const selections = decodeJWT(jwt)

  if (!selections) {
    console.error('Avacar v2: Invalid JWT token')

    return
  }

  const productId = selections.wheel_id || selections.wrap_id
  const allowedVariantIds = selections.variant_ids || []

  let product = null
  let variants: Awaited<ReturnType<typeof baseApi.fetchVariants>> = []

  if (productId) {
    const [p, v] = await Promise.all([
      baseApi.fetchProduct(productId),
      baseApi.fetchVariants(productId, allowedVariantIds),
    ])

    product = p
    variants = v
  }

  store.actions.open(selections, product, variants, customBrand)
  const gate = await baseApi.getEmailGate(product?.manufacturer_id)

  store.actions.setEmailGate(gate ?? FAIL_CLOSED_GATE)
}

function bindButtons() {
  const buttons = document.querySelectorAll<HTMLElement>('.avacar-preview[data-jwt]')

  debugTrace(`bindButtons: ${buttons.length} candidate(s)`)

  buttons.forEach((button) => {
    if (boundButtons.has(button)) return
    boundButtons.add(button)

    const jwt = button.getAttribute('data-jwt')

    if (!jwt) {
      debugError('button skipped: data-jwt is empty')

      return
    }

    const customBrand = button.getAttribute('data-brand') || undefined
    const buttonText = button.textContent?.trim()
      || button.getAttribute('data-text')
      || 'Preview on Your Car'
    const size = (button.getAttribute('data-size') as ButtonSize) || 'standard'
    const explicitTheme = button.getAttribute('data-button-theme') as ButtonTheme | null

    button.style.display = 'none'

    if (!decodeJWT(jwt)) {
      debugError('button skipped: data-jwt is not a decodable JWT')

      return
    }

    debugTrace('validating token', { jwt: `${jwt.slice(0, 12)}…` })

    // Validate against the v1 API exactly as src/index.tsx does, including honouring
    // `is_active: false` by removing the button.
    //
    // This is not optional politeness. Skipping it made the v2 side render a button on a
    // deactivated token while the v1 side correctly removed its own — so the comparison page
    // showed one button and looked broken, when in fact v1 was right and v2 was ignoring a
    // kill switch. A comparison that diverges on anything but the render is worse than none.
    baseApi.validateToken(jwt).then((result) => {
      if (!result) {
        debugError(
          'button hidden: /embed/validate returned no result. The request failed, was blocked '
          + '(CORS/network), or the response was not JSON.',
        )

        return
      }

      if (result.is_active === false) {
        debugWarn(
          'button removed: this embed token is deactivated (is_active: false). The token is '
          + 'valid but switched off server-side — it needs reactivating, or use another.',
        )
        button.remove()

        return
      }

      debugTrace('token ok, rendering button', result)

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
    }).catch((err) => {
      debugError('button hidden: token validation threw', err)
    })
  })
}

function init() {
  injectButtonStyles()
  mountWidget()
  bindButtons()

  const buttonObserver = new MutationObserver(() => {
    bindButtons()
  })

  buttonObserver.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

const AvaCar = {
  open: openPreview,
  bindButtons,
  createButton: (
    container: HTMLElement,
    jwt: string,
    options?: { text?: string; theme?: ButtonTheme; size?: ButtonSize; brand?: string },
  ) => {
    render(
      () => (
        <ZenoButton
          text={options?.text}
          theme={options?.theme || detectTheme(container)}
          size={options?.size}
          onClick={() => openPreview(jwt, options?.brand)}
        />
      ),
      container,
    )
  },
  /** Which pipeline this bundle renders through. Read by the comparison page's label. */
  pipeline: 'v2' as const,
  /** The v2 render host, so the test page can show which deployment it is hitting. */
  apiUrlV2: API_URL_V2,
}

;(window as unknown as Record<string, unknown>).AvaCar = AvaCar

export { AvaCar, openPreview, bindButtons }
