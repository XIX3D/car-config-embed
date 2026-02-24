import type { ButtonTheme } from '../types'

export function detectTheme(element: HTMLElement | null): ButtonTheme {
  let el = element
  while (el) {
    const theme = el.getAttribute('data-theme')
    if (theme === 'dark' || theme === 'light') return theme
    if (el.classList.contains('dark') || el.classList.contains('dark-mode'))
      return 'dark'
    if (el.classList.contains('light') || el.classList.contains('light-mode'))
      return 'light'
    el = el.parentElement
  }
  return 'light'
}

export function observeThemeChanges(callback: () => void): () => void {
  const observers: MutationObserver[] = []

  const themeObserver = new MutationObserver((mutations) => {
    const shouldUpdate = mutations.some(
      (m) => m.attributeName === 'data-theme' || m.attributeName === 'class'
    )
    if (shouldUpdate) callback()
  })

  if (document.documentElement) {
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    observers.push(themeObserver)
  }

  if (document.body) {
    const bodyObserver = new MutationObserver((mutations) => {
      const shouldUpdate = mutations.some(
        (m) => m.attributeName === 'data-theme' || m.attributeName === 'class'
      )
      if (shouldUpdate) callback()
    })
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    })
    observers.push(bodyObserver)
  }

  if (window.matchMedia) {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSchemeChange = () => callback()
    if (darkModeQuery.addEventListener) {
      darkModeQuery.addEventListener('change', handleSchemeChange)
    }
  }

  return () => {
    observers.forEach((o) => o.disconnect())
  }
}
