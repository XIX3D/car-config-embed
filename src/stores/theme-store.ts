import { createSignal, createMemo } from 'solid-js'
import { themes, type ThemeId } from '../config/themes'

const getInitialTheme = (): ThemeId => {
  const envTheme = import.meta.env.VITE_THEME as string
  if (envTheme in themes) return envTheme as ThemeId
  return 'zeno'
}

const [currentTheme, setCurrentTheme] = createSignal<ThemeId>(getInitialTheme())

const themeColors = createMemo(() => themes[currentTheme()])

export const themeStore = {
  get current() {
    return currentTheme()
  },

  get colors() {
    return themeColors()
  },

  set(theme: ThemeId) {
    setCurrentTheme(theme)
  },

  toggle() {
    const order: ThemeId[] = ['zeno', 'arctic', 'hre']
    setCurrentTheme(t => {
      const idx = order.indexOf(t)
      return order[(idx + 1) % order.length]
    })
  }
}

export { currentTheme, themeColors }
