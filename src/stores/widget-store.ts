import { createStore, produce } from 'solid-js/store'
import type { ViewState, RenderResult, Product, Variant, JWTPayload, DebugData, VehicleInfo, QuotaExceededError } from '../types'
import { LOADING_STEPS, LOADING_STEPS_WRAPS, ZOOM, ASPECT_THRESHOLDS } from '../constants'

export type ImageAspect = 'normal' | 'wide' | 'tall' | 'square' | null

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
  imageAspect: ImageAspect

  // Results
  galleryResults: RenderResult[]
  currentIndex: number
  hasRendered: boolean
  detectedVehicle: VehicleInfo | null
  interestedFinishes: number[]
  selectedVariantIds: string[]

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
  showRestartModal: boolean
  showRerenderModal: boolean
  pendingRerenderIndex: number | null

  // Quote view
  quoteViewIndex: number

  // Error
  error: string | null
  quotaError: QuotaExceededError | null

  // Debug
  debugData: DebugData | null

  // Single re-render
  rerenderingIndex: number | null
  rerenderRequestId: string | null
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
  imageAspect: null,

  galleryResults: [],
  currentIndex: 0,
  hasRendered: false,
  detectedVehicle: null,
  interestedFinishes: [],
  selectedVariantIds: [],

  loadingStep: 0,
  loadingInterval: null,

  zoomLevel: ZOOM.min,
  panX: 0,
  panY: 0,
  isDragging: false,

  showExitModal: false,
  showFullscreenModal: false,
  showShareModal: false,
  showRestartModal: false,
  showRerenderModal: false,
  pendingRerenderIndex: null,

  quoteViewIndex: 0,

  error: null,
  quotaError: null,

  debugData: null,

  rerenderingIndex: null,
  rerenderRequestId: null,
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
        selectedVariantIds: [],
      })
    },

    clearFile() {
      setState({
        selectedFile: null,
        previewDataUrl: null,
        selectedVariantIds: [],
        error: null,
      })
    },

    toggleVariantSelection(id: string) {
      setState('selectedVariantIds', produce((list) => {
        const i = list.indexOf(id)

        if (i !== -1) {
          list.splice(i, 1)

          return
        }
        list.push(id)
        if (list.length > 3) list.shift()
      }))
    },

    setImageAspect(width: number, height: number) {
      if (width <= 0 || height <= 0) {
        setState('imageAspect', null)

        return
      }

      const ratio = width / height
      let aspect: ImageAspect = 'square'

      if (ratio > ASPECT_THRESHOLDS.wide) aspect = 'wide'
      else if (ratio > ASPECT_THRESHOLDS.normal) aspect = 'normal'
      else if (ratio < ASPECT_THRESHOLDS.tall) aspect = 'tall'

      setState('imageAspect', aspect)
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

    setResults(results: RenderResult[], detectedVehicle?: VehicleInfo) {
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

    initResults(results: RenderResult[]) {
      setState({
        galleryResults: results,
        currentIndex: 0,
      })
    },

    updateResult(index: number, result: Partial<RenderResult>) {
      setState('galleryResults', index, (prev) => ({ ...prev, ...result }))

      if (state.view !== 'loading') return
      if (state.quotaError) return

      const firstResult = state.galleryResults[0]

      if (firstResult?.success && !firstResult?.loading) {
        actions.stopLoading()
        setState({ view: 'result', currentIndex: 0, hasRendered: true })

        return
      }

      const allDone = state.galleryResults.every((r) => !r.loading)

      if (!allDone) return

      actions.stopLoading()

      const firstSuccess = state.galleryResults.findIndex((r) => r.success)

      if (firstSuccess !== -1) {
        setState({ view: 'result', currentIndex: firstSuccess, hasRendered: true })
      } else {
        setState({ view: 'upload', error: 'Rendering failed. Please try again with a different image.' })
      }
    },

    setDetectedVehicle(vehicle: VehicleInfo) {
      setState('detectedVehicle', vehicle)
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
        selectedVariantIds: [],
        error: null,
        debugData: null,
        zoomLevel: ZOOM.min,
        panX: 0,
        panY: 0,
        rerenderingIndex: null,
        rerenderRequestId: null,
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

    setDebugData(data: DebugData) {
      setState('debugData', data)
    },

    setError(error: string | null) {
      setState('error', error)
    },

    setQuotaError(data: QuotaExceededError | null) {
      setState('quotaError', data)
    },

    removeResult(index: number) {
      setState('galleryResults', (prev) => prev.filter((_, i) => i !== index))
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

    toggleRestartModal(show: boolean) {
      setState('showRestartModal', show)
    },

    toggleRerenderModal(show: boolean, index?: number) {
      setState({
        showRerenderModal: show,
        pendingRerenderIndex: show ? (index ?? null) : null,
      })
    },

    setQuoteViewIndex(index: number) {
      setState('quoteViewIndex', index)
    },

    setRerenderingIndex(index: number | null, requestId?: string) {
      setState({
        rerenderingIndex: index,
        rerenderRequestId: requestId || null,
      })
    },

    updateSingleResult(index: number, result: Partial<RenderResult>, requestId?: string) {
      if (requestId && state.rerenderRequestId !== requestId) {
        return
      }

      const updatedResult = { ...result }

      if (result.success) {
        delete updatedResult.error
      }

      setState('galleryResults', index, (prev) => ({ ...prev, ...updatedResult }))
      setState({
        rerenderingIndex: null,
        rerenderRequestId: null,
      })
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
