import { render } from 'solid-js/web'
import { createSignal, onCleanup } from 'solid-js'
import './styles/index.css'

import { Modal } from './components/Modal'
import { ZenoButton } from './components/ZenoButton'
import { createWidgetStore } from './stores/widget-store'
import { createApiClient } from './utils/api'
import { decodeJWT } from './utils/jwt'
import { detectTheme, observeThemeChanges } from './utils/theme'
import type { ButtonTheme, ButtonSize, WidgetConfig } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.platform.xix3d.com'

const store = createWidgetStore()
const api = createApiClient(API_URL)

let rootEl: HTMLElement | null = null
const boundButtons = new WeakSet<Element>()

function mountWidget() {
  if (rootEl) return

  rootEl = document.createElement('div')
  rootEl.id = 'avacar-embed-root'
  document.body.appendChild(rootEl)

  render(() => <Modal store={store} api={api} />, rootEl)
}

async function openPreview(jwt: string, customBrand?: string) {
  if (!jwt) {
    console.error('Avacar: No JWT token provided')

    return
  }

  const selections = decodeJWT(jwt)

  if (!selections) {
    console.error('Avacar: Invalid JWT token')

    return
  }

  mountWidget()

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

    if (useDefaultStyle) {
      const theme = explicitTheme || detectTheme(button)

      const wrapper = document.createElement('div')

      button.parentNode?.insertBefore(wrapper, button)
      button.style.display = 'none'

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

      if (!explicitTheme) {
        const btn = wrapper.querySelector('.avacar-btn-zeno')

        if (btn) {
          btn.setAttribute('data-jwt', jwt)
        }
      } else {
        const btn = wrapper.querySelector('.avacar-btn-zeno')

        if (btn) {
          btn.setAttribute('data-theme-locked', 'true')
          btn.setAttribute('data-jwt', jwt)
        }
      }
    } else {
      button.addEventListener('click', (e) => {
        e.preventDefault()
        openPreview(jwt, customBrand)
      })
    }
  })
}

function updateAllHoloButtonThemes() {
  const zenoButtons = document.querySelectorAll<HTMLElement>('.avacar-btn-zeno[data-jwt]')

  zenoButtons.forEach((btn) => {
    if (btn.getAttribute('data-theme-locked') === 'true') return
    const theme = detectTheme(btn)

    btn.classList.remove('light-mode', 'dark-mode')
    btn.classList.add(theme === 'dark' ? 'dark-mode' : 'light-mode')
  })
}

function init() {
  mountWidget()
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
