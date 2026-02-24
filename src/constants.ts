import type { LoadingStep } from './types'

export const ZENO = {
  cyan: '#44CCFF',
  green: '#46FF81',
  pink: '#FF44CC',
  dark: '#0a0a0a',
  card: '#1a1a1a',
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
} as const
