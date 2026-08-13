import { createStore, produce } from 'solid-js/store'
import type { ViewState, RenderResult, Product, Variant, JWTPayload, DebugData, VehicleInfo, QuotaExceededError, EmailGateResponse, LoadingStep } from '../types'
import { LOADING_STEPS, LOADING_STEPS_WRAPS, ZOOM, ASPECT_THRESHOLDS } from '../constants'

/**
 * An alternate loading script set, supplied by a caller instead of imported here.
 *
 * The two-pass (v2) pipeline has its own, much longer script. The store deliberately does
 * not import it: `getLoadingSteps()` runs on every render, so a direct import would keep
 * the v2 strings alive in the `latest` bundle that every customer site loads, which is
 * exactly what src/config/pipeline.ts exists to prevent. A v2-capable entry point calls
 * `enableV2Loading()` with src/config/loading-v2.ts's `V2_LOADING_SCRIPTS`; the production
 * entry point never does, so v2 stays structurally absent.
 */
export type V2StageName = 'analyzing' | 'mask' | 'fill' | 'composite'

export interface AltLoadingScripts {
  /** Full script, every stage running. */
  cold: LoadingStep[]
  /** Script with the cacheable stage removed, for when the backend served it from cache. */
  cached: LoadingStep[]
  /** Index of each named stage within `cold`. */
  stages: Record<V2StageName, number>
  /** Which named stage `cached` omits. */
  cachedOmits: V2StageName
}

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
  /**
   * True while a two-pass (v2) render is in flight, which selects the longer loading
   * script and enables the event-driven stage sync. Set by the render caller, not by the
   * store, so v1 is untouched.
   */
  isV2Render: boolean
  /**
   * Set when the backend reports the mask came from the session cache. That render skips
   * pass 1 entirely (~14s), so the "isolating wheels" stage is dropped from the script
   * rather than shown for a stage that is not happening.
   */
  maskCached: boolean

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
  emailGate: EmailGateResponse | null

  // Debug
  debugData: DebugData | null
  showQuotaModal: boolean

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
  isV2Render: false,
  maskCached: false,

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
  emailGate: null,

  debugData: null,
  showQuotaModal: true,

  rerenderingIndex: null,
  rerenderRequestId: null,
}

export function createWidgetStore() {
  const [state, setState] = createStore<WidgetState>({ ...initialState })

  /**
   * The alternate script set for the two-pass pipeline, or null on a build that has no
   * such pipeline. Held in a closure rather than in store state so the store never names
   * the v2 module — see `AltLoadingScripts`.
   */
  let altScripts: AltLoadingScripts | null = null

  /**
   * The loading script for the render in flight.
   *
   * On a v2 render whose mask came from the session cache, pass 1 does not run at all, so
   * the "isolating wheels" stage is dropped rather than displayed for work that is not
   * happening. That also shortens the script to match the ~30s cached render instead of the
   * ~45s cold one.
   */
  const getLoadingSteps = () => {
    if (state.isWraps) return LOADING_STEPS_WRAPS
    if (!altScripts || !state.isV2Render) return LOADING_STEPS

    return state.maskCached ? altScripts.cached : altScripts.cold
  }

  /**
   * Map a v2 stage index onto the script currently displayed.
   *
   * Dropping the mask stage on a cached render shifts every later stage down by one, so
   * callers name the stage and this resolves the index. A `mask` event on a cached render
   * resolves to the stage before it — the pointer must not move for a pass that is being
   * skipped, and `syncLoadingStage` only ever moves forward, so this is a no-op there.
   */
  const resolveStageIndex = (stage: number) => {
    if (!altScripts || !state.maskCached) return stage

    return stage < altScripts.stages[altScripts.cachedOmits] ? stage : stage - 1
  }

  const getBrandName = () =>
    state.customBrand ||
    state.product?.category ||
    (state.isWraps ? 'WRAPS' : 'WHEELS')

  const getModelName = () =>
    state.product?.name || (state.isWraps ? 'Wrap' : 'Wheel')

  const getCurrentResult = () =>
    state.galleryResults[state.currentIndex] || null

  /**
   * Whether the two-pass loading display is available, i.e. a caller supplied its scripts.
   *
   * This is how components ask "are we running v2?" without importing anything v2 — the
   * presence of injected scripts IS the signal. Keeps Modal.tsx, which ships in the
   * production bundle, free of v2 references.
   */
  const isV2LoadingEnabled = () => altScripts !== null

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

    /**
     * Supply the two-pass pipeline's loading scripts.
     *
     * Called once, at startup, by an entry point on a build that can actually run v2. Until
     * it is called, `startLoading(true)` falls back to the v1 script rather than failing —
     * a build without v2 never issues a v2 render in the first place.
     */
    enableV2Loading(scripts: AltLoadingScripts) {
      altScripts = scripts
    },

    /**
     * Begin the loading display.
     *
     * `isV2` selects the two-pass script, which is roughly 2.5x longer because a cold v2
     * render measures ~45s against v1's ~23s. Reusing v1's 18.4s script for it would run
     * the text out at 18s and leave a frozen final message for another 27 seconds.
     *
     * The timer advances the text WITHIN a stage so a long stage still looks alive, but on
     * v2 the real SSE events drive which stage is showing — see `syncLoadingStage`. The
     * timer never advances past the stage an event has established, so a slow backend can
     * no longer be overtaken by an optimistic clock.
     */
    startLoading(isV2 = false) {
      setState({
        view: 'loading',
        loadingStep: 0,
        error: null,
        isV2Render: isV2,
        maskCached: false,
      })

      let elapsed = 0

      // Reading store state inside a timer is deliberate, not a missed tracked scope: this
      // is a fallback clock, and it must observe whatever the SSE events have already set.
      // eslint-disable-next-line solid/reactivity
      const interval = window.setInterval(() => {
        elapsed += 100
        setState(produce((s) => {
          // Re-read each tick: a cached-mask event can shorten the script mid-render.
          const steps = getLoadingSteps()
          let total = 0

          for (let i = 0; i <= s.loadingStep && i < steps.length; i++) {
            total += steps[i].duration
          }

          if (elapsed >= total && s.loadingStep < steps.length - 1) {
            s.loadingStep += 1
          }
        }))
      }, 100)

      setState('loadingInterval', interval)
    },

    /**
     * Move the display to a real pipeline stage, reported by an SSE event.
     *
     * Takes a stage NAME rather than an index so callers never handle the numbers — those
     * live only in the v2 module, which the production bundle must not reach.
     *
     * Only ever moves forward. The timer runs concurrently and may already have advanced
     * past this stage on a fast backend; snapping backwards would read as the render
     * regressing.
     */
    syncLoadingStage(stage: V2StageName) {
      // Gated on the render in flight, not just on the build: a v2-capable build still runs
      // v1 renders, and those show the v1 script, whose indices these stage names do not
      // address. Ungated, a stray event would jump a v1 render to its final stage.
      const scripts = altScripts

      if (!scripts || !state.isV2Render) return

      const target = resolveStageIndex(scripts.stages[stage])

      setState(produce((s) => {
        if (target > s.loadingStep) s.loadingStep = target
      }))
    },

    /**
     * Record that the mask came from the session cache, which drops the "isolating wheels"
     * stage from the script — that pass is genuinely not running, and it is the ~14s that
     * makes a second finish faster than the first.
     */
    setMaskCached(cached: boolean) {
      // Same gate as syncLoadingStage: only a v2 render has a mask stage to drop.
      if (!cached || state.maskCached || !altScripts || !state.isV2Render) return

      setState('maskCached', true)

      // The script just lost a stage; keep the pointer inside it. Clamped after the flag
      // is committed, so getLoadingSteps() returns the shortened script rather than the
      // one we are replacing.
      const lastStep = getLoadingSteps().length - 1

      if (state.loadingStep > lastStep) setState('loadingStep', lastStep)
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

      // Show the gallery as soon as ANY finish has an image, not only when the first one does.
      //
      // Waiting specifically on slot 0 means one failed finish holds back every finish behind
      // it — and on the two-pass pipeline, where renders are serialised and each takes ~30s,
      // that is a long wait for results that already exist. Worse, if slot 0 fails the user is
      // sent back to the upload screen and never sees the finishes that did succeed.
      const firstReady = state.galleryResults.findIndex((r) => r.success && !r.loading)

      if (firstReady !== -1) {
        actions.stopLoading()
        setState({ view: 'result', currentIndex: firstReady, hasRendered: true })

        return
      }

      const allDone = state.galleryResults.every((r) => !r.loading)

      if (!allDone) return

      actions.stopLoading()

      // Only every finish failing sends the user back — the gallery has nothing to show.
      setState({ view: 'upload', error: 'Rendering failed. Please try again with a different image.' })
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

    toggleShowQuotaModal() {
      setState('showQuotaModal', (v) => !v)
    },

    setError(error: string | null) {
      setState('error', error)
    },

    setQuotaError(data: QuotaExceededError | null) {
      setState('quotaError', data)
    },

    setEmailGate(gate: EmailGateResponse | null) {
      setState('emailGate', gate)
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
    isV2LoadingEnabled,
  }
}

export type WidgetStore = ReturnType<typeof createWidgetStore>
