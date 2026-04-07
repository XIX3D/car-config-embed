export const themes = {
  zeno: {
    primary: '#3b82f6',
    primaryLight: '#93c5fd',
    primaryMuted: '#e0e7ff',
    bgDark: '#0a0a0a',
    bgCard: '#0d151f',
    bgElevated: '#182639',
    success: '#84FF8E',
    error: '#ff6b6b',
  },
  arctic: {
    primary: '#595959',
    primaryLight: '#FFFFFF',
    primaryMuted: '#373737',
    bgDark: '#262626',
    bgCard: '#373737',
    bgElevated: '#595959',
    success: '#FFFFFF',
    error: '#ff6b6b',
  },
  hre: {
    primary: '#c0392b',
    primaryLight: '#ffffff',
    primaryMuted: '#a0a0a0',
    bgDark: '#0a0a0a',
    bgCard: '#141414',
    bgElevated: '#1f1f1f',
    success: '#c0392b',
    error: '#ff6b6b',
  },
} as const

export type ThemeId = keyof typeof themes
export type ThemeColors = typeof themes[ThemeId]
