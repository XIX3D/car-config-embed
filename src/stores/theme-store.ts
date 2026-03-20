import { createSignal, createMemo } from 'solid-js'
import { themes, type ThemeId } from '../config/themes'

const getInitialTheme = (): ThemeId => {
  const envTheme = import.meta.env.VITE_THEME
  return envTheme === 'arctic' ? 'arctic' : 'zeno'
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
    setCurrentTheme(t => t === 'zeno' ? 'arctic' : 'zeno')
  }
}

export { currentTheme, themeColors }
