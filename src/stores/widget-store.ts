import { createStore, produce } from 'solid-js/store'
import type { ViewState, RenderResult, Product, Variant, JWTPayload } from '../types'
import { LOADING_STEPS, LOADING_STEPS_WRAPS, ZOOM } from '../constants'

export interface WidgetState {
  view: ViewState
  isOpen: boolean
  isWraps: boolean

  // Product data
  selections: JWTPayload | null
  product: Product | null
  variants: Variant[]
  customBrand: string | null

  // File handling
  selectedFile: File | null
  previewDataUrl: string | null

  // Results
  galleryResults: RenderResult[]
  currentIndex: number
  hasRendered: boolean
  detectedVehicle: string | null
  interestedFinishes: number[]

  // Loading
  loadingStep: number
  loadingInterval: number | null

  // Zoom
  zoomLevel: number
  panX: number
  panY: number
  isDragging: boolean

  // Modals
  showExitModal: boolean
  showFullscreenModal: boolean
  showShareModal: boolean

  // Error
  error: string | null
}

const initialState: WidgetState = {
  view: 'upload',
  isOpen: false,
  isWraps: false,

  selections: null,
  product: null,
  variants: [],
  customBrand: null,

  selectedFile: null,
  previewDataUrl: null,

  galleryResults: [],
  currentIndex: 0,
  hasRendered: false,
  detectedVehicle: null,
  interestedFinishes: [],

  loadingStep: 0,
  loadingInterval: null,

  zoomLevel: ZOOM.min,
  panX: 0,
  panY: 0,
  isDragging: false,

  showExitModal: false,
  showFullscreenModal: false,
  showShareModal: false,

  error: null,
}

export function createWidgetStore() {
  const [state, setState] = createStore<WidgetState>({ ...initialState })

  const getLoadingSteps = () => state.isWraps ? LOADING_STEPS_WRAPS : LOADING_STEPS

  const getBrandName = () =>
    state.customBrand ||
    state.product?.category ||
    (state.isWraps ? 'WRAPS' : 'WHEELS')

  const getModelName = () =>
    state.product?.name || (state.isWraps ? 'Wrap' : 'Wheel')

  const getCurrentResult = () =>
    state.galleryResults[state.currentIndex] || null

  const actions = {
    open(selections: JWTPayload, product: Product | null, variants: Variant[], customBrand?: string) {
      const isWraps = !!(selections.wrap_id && !selections.wheel_id)

      setState({
        ...initialState,
        isOpen: true,
        selections,
        product,
        variants,
        customBrand: customBrand || null,
        isWraps,
      })
    },

    close() {
      if (state.loadingInterval) {
        clearInterval(state.loadingInterval)
      }
      setState({ ...initialState })
    },

    setView(view: ViewState) {
      setState('view', view)
    },

    setFile(file: File, dataUrl: string) {
      setState({
        selectedFile: file,
        previewDataUrl: dataUrl,
      })
    },

    startLoading() {
      setState({
        view: 'loading',
        loadingStep: 0,
        error: null,
      })

      let elapsed = 0
      const steps = getLoadingSteps()

      const interval = window.setInterval(() => {
        elapsed += 100
        setState(produce((s) => {
          let total = 0

          for (let i = 0; i <= s.loadingStep; i++) {
            total += steps[i].duration
          }
          if (elapsed >= total && s.loadingStep < steps.length - 1) {
            s.loadingStep += 1
          }
        }))
      }, 100)

      setState('loadingInterval', interval)
    },

    stopLoading() {
      if (state.loadingInterval) {
        clearInterval(state.loadingInterval)
        setState('loadingInterval', null)
      }
    },

    setResults(results: RenderResult[], detectedVehicle?: string) {
      actions.stopLoading()

      const successfulResults = results.filter((r) => r.success)

      if (successfulResults.length === 0) {
        setState({
          view: 'upload',
          error: 'All render requests failed. Please try again.',
        })

        return
      }

      setState({
        view: 'result',
        galleryResults: successfulResults,
        currentIndex: 0,
        hasRendered: true,
        detectedVehicle: detectedVehicle || null,
      })
    },

    setCurrentIndex(index: number) {
      setState({
        currentIndex: index,
        zoomLevel: ZOOM.min,
        panX: 0,
        panY: 0,
      })
    },

    showQuote() {
      const current = getCurrentResult()

      if (current && !state.interestedFinishes.includes(state.currentIndex)) {
        setState('interestedFinishes', [...state.interestedFinishes, state.currentIndex])
      }
      setState('view', 'quote')
    },

    toggleFinishInterest(index: number) {
      const idx = state.interestedFinishes.indexOf(index)

      if (idx > -1) {
        setState('interestedFinishes', state.interestedFinishes.filter((_, i) => i !== idx))
      } else {
        setState('interestedFinishes', [...state.interestedFinishes, index])
      }
    },

    showSuccess() {
      setState('view', 'success')
    },

    resetToUpload() {
      setState({
        view: 'upload',
        selectedFile: null,
        previewDataUrl: null,
        galleryResults: [],
        currentIndex: 0,
        hasRendered: false,
        interestedFinishes: [],
        error: null,
        zoomLevel: ZOOM.min,
        panX: 0,
        panY: 0,
      })
    },

    setZoom(level: number) {
      const newZoom = Math.max(ZOOM.min, Math.min(ZOOM.max, level))

      setState('zoomLevel', newZoom)
      if (newZoom <= ZOOM.min) {
        setState({ panX: 0, panY: 0 })
      }
    },

    setPan(x: number, y: number) {
      setState({ panX: x, panY: y })
    },

    setDragging(dragging: boolean) {
      setState('isDragging', dragging)
    },

    setError(error: string | null) {
      setState('error', error)
    },

    toggleExitModal(show: boolean) {
      setState('showExitModal', show)
    },

    toggleFullscreenModal(show: boolean) {
      setState('showFullscreenModal', show)
    },

    toggleShareModal(show: boolean) {
      setState('showShareModal', show)
    },
  }

  return {
    state,
    actions,
    getLoadingSteps,
    getBrandName,
    getModelName,
    getCurrentResult,
  }
}

export type WidgetStore = ReturnType<typeof createWidgetStore>
