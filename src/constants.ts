import type { LoadingStep } from './types'

export const ZENO = {
  electric: '#3b82f6',
  cyan: '#93c5fd',
  green: '#e0e7ff',
  pink: '#FF44CC',
  dark: '#0a0a0a',
  card: '#0d151f',
  heart: '#ff6b6b',
} as const

export const MODAL_ID = 'avacar-embed-modal'
export const STYLES_ID = 'avacar-embed-styles'

export const LOADING_STEPS: LoadingStep[] = [
  { text: 'Analyzing vehicle', duration: 5000 },
  { text: 'Detecting wheels', duration: 5000 },
  { text: 'Applying finish', duration: 5000 },
  { text: 'Rendering', duration: 3400 },
]

export const LOADING_STEPS_WRAPS: LoadingStep[] = [
  { text: 'Preparing image', duration: 5000 },
  { text: 'Calculating wrap areas', duration: 5000 },
  { text: 'Applying wrap', duration: 5000 },
  { text: 'Taking 4k picture', duration: 3400 },
]

export const VALID_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export const ZOOM = {
  min: 1,
  max: 4,
  step: 0.25,
  resetThreshold: 1.05,
} as const

export const PARTICLE_CONFIG = {
  defaultCount: 12,
  leftRange: { min: 10, max: 80 },
  topRange: { min: 60, max: 35 },
  sizeRange: { base: 2, variance: 1.5 },
  durationRange: { base: 18, variance: 8 },
  staggerMultiplier: 20,
} as const

export const CONFETTI_CONFIG = {
  count: 50,
  colors: ['#3b82f6', '#93c5fd', '#e0e7ff', '#ffffff'],
  durationRange: { base: 2, variance: 2 },
  sizeRange: { base: 4, variance: 8 },
  driftRange: { base: -50, variance: 100 },
  maxDelay: 2,
} as const

export const SPARKLE_CONFIG = {
  count: 8,
  distanceRange: { base: 50, variance: 30 },
  delayStep: 0.15,
} as const

export const ASPECT_THRESHOLDS = {
  wide: 2.2,
  normal: 1.4,
  tall: 0.9,
} as const
