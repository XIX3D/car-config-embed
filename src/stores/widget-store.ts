import { batch } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { ViewState, RenderResult, Product, Variant, JWTPayload, DebugData, VehicleInfo, EmailGateResponse, LoadingStep, ProblemKind, VisitorUsage } from '../types'
import { LOADING_STEPS, LOADING_STEPS_WRAPS } from '../constants'

/**
 * An alternate loading script set, supplied by a caller instead of imported here.
 *
 * The two-pass (v2) pipeline has its own, much longer script. Entry points that render
 * through v2 call `enableV2Loading()` with src/config/loading-v2.ts's `V2_LOADING_SCRIPTS`.
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

/** The small cards over the window: a sent quote, leaving, renders emailed. */
export type Popup = 'sent' | 'leave' | 'emailed'

export interface Lead {
  name: string
  email: string
  phone: string
}

export interface WidgetState {
  view: ViewState
  isOpen: boolean
  isWraps: boolean

  // Product data
  selections: JWTPayload | null
  product: Product | null
  variants: Variant[]
  customBrand: string | null

  // The visitor's photo. photoKey changes with every new photo, so a finish rendered on one
  // photo is offered again on the next.
  selectedFile: File | null
  previewDataUrl: string | null
  photoKey: number

  // Results, across every photo of this visit. Ids, not indexes: a failed slot leaves the strip.
  galleryResults: RenderResult[]
  currentId: number | null
  hasRendered: boolean
  detectedVehicle: VehicleInfo | null
  /** The renders the visitor wants a quote for (hearts on the quote screen). */
  interested: number[]
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

  // Over the window
  notice: ProblemKind | null
  popup: Popup | null
  showFullscreen: boolean
  /** The compare button: the visitor's own photo in place of the render. */
  showOriginal: boolean
  /** Where the quote screen's back chevron returns to. */
  quoteBack: ViewState

  // Gate, limit, features (backend R2, R3, R7: all optional)
  emailGate: EmailGateResponse | null
  detailsRequired: boolean
  visitorLimit: number | null
  visitorUsed: number | null
  emailRendersOn: boolean
  /** What the visitor typed in Your details or the quote form, so they never type it twice. */
  lead: Lead
  renderLogIds: number[]
  quoteSent: boolean
  rendersEmailed: boolean

  // Debug
  debugData: DebugData | null
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
  photoKey: 0,

  galleryResults: [],
  currentId: null,
  hasRendered: false,
  detectedVehicle: null,
  interested: [],
  selectedVariantIds: [],

  loadingStep: 0,
  loadingInterval: null,
  isV2Render: false,
  maskCached: false,

  notice: null,
  popup: null,
  showFullscreen: false,
  showOriginal: false,
  quoteBack: 'result',

  emailGate: null,
  detailsRequired: false,
  visitorLimit: null,
  visitorUsed: null,
  emailRendersOn: false,
  lead: { name: '', email: '', phone: '' },
  renderLogIds: [],
  quoteSent: false,
  rendersEmailed: false,

  debugData: null,
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

  /** The brand, for the header ("Brand - Wheel") and the quote footer. */
  const getBrandName = () =>
    state.customBrand ||
    state.product?.manufacturer?.company_name ||
    state.product?.category ||
    (state.isWraps ? 'Wraps' : 'Wheels')

  const getModelName = () =>
    state.product?.name || (state.isWraps ? 'Wrap' : 'Wheel')

  const getCurrentResult = () =>
    state.galleryResults.find((r) => r.id === state.currentId) || null

  /** The renders that finished, in the order they were made. */
  const getDoneResults = () => state.galleryResults.filter((r) => r.success && r.image)

  /** True once the visitor has used every render the brand allows (backend R2). */
  const isLimitReached = () =>
    state.visitorLimit !== null && state.visitorUsed !== null && state.visitorUsed >= state.visitorLimit

  /**
   * Whether the two-pass loading display is available, i.e. a caller supplied its scripts.
   *
   * This is how components ask "are we running v2?" without importing anything v2 — the
   * presence of injected scripts IS the signal.
   */
  const isV2LoadingEnabled = () => altScripts !== null

  let nextId = 1

  const restartTimer = () => {
    if (state.loadingInterval) clearInterval(state.loadingInterval)

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
  }

  const actions = {
    open(selections: JWTPayload, product: Product | null, variants: Variant[], customBrand?: string) {
      const isWraps = !!(selections.wrap_id && !selections.wheel_id)

      if (state.loadingInterval) clearInterval(state.loadingInterval)
      setState({
        ...initialState,
        isOpen: true,
        selections,
        product,
        variants,
        customBrand: customBrand || null,
        isWraps,
        // A brand with one finish has nothing to pick: it is picked.
        selectedVariantIds: variants.length === 1 ? [variants[0].id] : [],
      })
    },

    close() {
      if (state.loadingInterval) {
        clearInterval(state.loadingInterval)
      }
      setState({ ...initialState })
    },

    setView(view: ViewState) {
      setState({ view, showOriginal: false })
    },

    /** A new photo: the first finish is picked for it, as the studio does. */
    setFile(file: File, dataUrl: string, firstVariantId?: string) {
      setState({
        selectedFile: file,
        previewDataUrl: dataUrl,
        photoKey: state.photoKey + 1,
        selectedVariantIds: firstVariantId ? [firstVariantId] : [],
        view: 'upload',
      })
    },

    clearFile() {
      setState({
        selectedFile: null,
        previewDataUrl: null,
        selectedVariantIds: state.variants.length === 1 ? [state.variants[0].id] : [],
        view: 'upload',
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
        isV2Render: isV2,
        maskCached: false,
        notice: null,
        showOriginal: false,
      })
      restartTimer()
    },

    /**
     * A queued render has started: the next finish after the first. The script starts over
     * for it, without leaving the result screen the visitor is on.
     */
    restartLoading() {
      setState({ loadingStep: 0, maskCached: false })
      restartTimer()
    },

    /**
     * Move the display to a real pipeline stage, reported by an SSE event.
     *
     * Takes a stage NAME rather than an index so callers never handle the numbers — those
     * live only in the v2 module.
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

    /** New render slots, one per finish, shown as skeletons until they arrive. Returns their ids. */
    addSlots(slots: Array<Omit<RenderResult, 'id' | 'success' | 'loading'>>) {
      const added = slots.map((s) => ({ ...s, id: nextId++, success: false, loading: true }))

      setState('galleryResults', (prev) => [...prev, ...added])

      return added.map((s) => s.id)
    },

    /** A render arrived: it fills the window at once. */
    completeSlot(id: number, image: string) {
      setState('galleryResults', (r) => r.id === id, { image, success: true, loading: false })
      setState({ currentId: id, hasRendered: true, showOriginal: false })
      if (state.view === 'loading') setState('view', 'result')
    },

    /** A render failed or was cancelled: its slot leaves the strip (no empty boxes). */
    dropSlot(id: number) {
      setState(produce((s) => {
        s.galleryResults = s.galleryResults.filter((r) => r.id !== id)
        s.interested = s.interested.filter((i) => i !== id)
        if (s.currentId === id) {
          const done = s.galleryResults.filter((r) => r.success)

          s.currentId = done.length ? done[done.length - 1].id : null
        }
      }))
    },

    setDetectedVehicle(vehicle: VehicleInfo) {
      setState('detectedVehicle', vehicle)
    },

    select(id: number) {
      setState({ currentId: id, showOriginal: false })
    },

    toggleOriginal() {
      setState('showOriginal', (v) => !v)
    },

    /** Request quote: the render on screen is the one it is for, until the visitor adds more. */
    showQuote() {
      let back = state.view === 'quote' ? state.quoteBack : state.view

      // The loading screen is gone by the time the visitor comes back.
      if (back === 'loading') back = getDoneResults().length ? 'result' : 'upload'
      setState({
        view: 'quote',
        quoteBack: back,
        interested: state.currentId !== null ? [state.currentId] : [],
        notice: null,
        popup: null,
        showOriginal: false,
      })
    },

    toggleInterest(id: number) {
      const has = state.interested.includes(id)

      // Never none: the quote is always for at least one render.
      if (has && state.interested.length < 2) return
      setState('interested', has ? state.interested.filter((i) => i !== id) : [...state.interested, id])
    },

    /** Picking a render on the quote screen shows it and puts it in the quote. */
    focusInterest(id: number) {
      setState({ currentId: id })
      if (!state.interested.includes(id)) setState('interested', [...state.interested, id])
    },

    markQuoteSent() {
      setState({ quoteSent: true, popup: 'sent', view: state.quoteBack })
    },

    setLead(lead: Partial<Lead>) {
      setState('lead', (prev) => ({ ...prev, ...lead }))
    },

    setNotice(kind: ProblemKind | null) {
      setState('notice', kind)
    },

    setPopup(popup: Popup | null) {
      setState('popup', popup)
    },

    markRendersEmailed() {
      setState({ rendersEmailed: true, popup: 'emailed' })
    },

    toggleFullscreen(show: boolean) {
      setState('showFullscreen', show)
    },

    setDebugData(data: DebugData) {
      setState('debugData', data)
    },

    /**
     * The email-required answer. Besides the long-standing gate it may carry the visitor's limit
     * (R2), details-first (R3) and new features (R7); each is ignored when absent.
     */
    setEmailGate(gate: EmailGateResponse | null) {
      // One update, so anything watching the gate sees the limit and the view that came with it.
      batch(() => {
        if (gate && typeof gate.visitor_limit === 'number' && typeof gate.visitor_used === 'number') {
          setState({ visitorLimit: gate.visitor_limit, visitorUsed: gate.visitor_used })
        }
        if (gate?.features?.email_renders === true) setState('emailRendersOn', true)
        if (gate && (gate.details_required === true || gate.email_required)) {
          setState({ detailsRequired: true, view: 'details' })
        }
        setState('emailGate', gate)
      })
    },

    /** The details were taken (G1 or the old email gate): on to the photo. */
    detailsDone() {
      setState({
        detailsRequired: false,
        emailGate: state.emailGate ? { ...state.emailGate, email_required: false, details_required: false } : null,
        view: 'upload',
      })
    },

    setVisitorUsage(usage: VisitorUsage) {
      setState({ visitorLimit: usage.limit, visitorUsed: usage.used })
    },

    addRenderLogIds(ids: number[]) {
      setState('renderLogIds', (prev) => [...prev, ...ids])
    },
  }

  return {
    state,
    actions,
    getLoadingSteps,
    getBrandName,
    getModelName,
    getCurrentResult,
    getDoneResults,
    isLimitReached,
    isV2LoadingEnabled,
  }
}

export type WidgetStore = ReturnType<typeof createWidgetStore>
