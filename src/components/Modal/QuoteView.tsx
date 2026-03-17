import { createSignal, For, Show, createEffect } from 'solid-js'
import type { RenderResult } from '../../types'
import { TruncatedTitle } from './TruncatedTitle'

interface CustomerData {
  name: string
  email: string
  phone?: string
}

interface QuoteViewProps {
  productImgUrl: string
  brandName: string
  modelName: string
  results: RenderResult[]
  interestedFinishes: number[]
  detectedVehicle: string | null
  quoteViewIndex: number
  onClose: () => void
  onBack: () => void
  onToggleFinish: (index: number) => void
  onSubmit: (customer: CustomerData, vehicle: string) => Promise<void>
  onQuoteViewIndexChange: (index: number) => void
  onFullscreen: () => void
}

export function QuoteView(props: QuoteViewProps) {
  const getInitialVehicle = () => props.detectedVehicle || ''
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [phone, setPhone] = createSignal('')
  const [vehicle, setVehicle] = createSignal(getInitialVehicle())
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [touchStartX, setTouchStartX] = createSignal(0)

  const currentResult = () => props.results[props.quoteViewIndex]
  const isLiked = (index: number) => props.interestedFinishes.includes(index)

  createEffect(() => {
    if (props.quoteViewIndex >= props.results.length) {
      props.onQuoteViewIndexChange(0)
    }
  })

  const handleClose = () => props.onClose()
  const handleBack = () => props.onBack()

  const findNextValidIndex = (startIndex: number, direction: 1 | -1): number => {
    const len = props.results.length
    let index = startIndex

    for (let i = 0; i < len; i++) {
      index = (index + direction + len) % len
      const result = props.results[index]

      if (result.success && !result.loading && result.image) {
        return index
      }
    }

    return props.quoteViewIndex
  }

  const handlePrev = () => {
    const newIndex = findNextValidIndex(props.quoteViewIndex, -1)

    props.onQuoteViewIndexChange(newIndex)
  }

  const handleNext = () => {
    const newIndex = findNextValidIndex(props.quoteViewIndex, 1)

    props.onQuoteViewIndexChange(newIndex)
  }

  const handleTouchStart = (e: TouchEvent) => {
    setTouchStartX(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX
    const diff = touchStartX() - touchEndX
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext()
      else handlePrev()
    }
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await props.onSubmit(
        {
          name: name(),
          email: email(),
          phone: phone() || undefined,
        },
        vehicle(),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div class="relative z-1 p-6 flex flex-col min-h-[520px] max-h-[90vh] overflow-y-auto scrollbar-hide">
      {/* Header */}
      <div class="flex items-center justify-between mb-3 w-full animate-fadeInUp">
        <button
          class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/10 hover:border-white/20 flex-shrink-0"
          aria-label="Back"
          onClick={handleBack}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {props.productImgUrl ? (
              <img class="w-9 h-9 rounded-full object-cover" src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div class="w-9 h-9 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
            )}
          </div>
          <div class="flex flex-col text-left">
            <span class="text-[9px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle text={props.modelName} class="text-lg font-medium text-white" />
          </div>
        </div>
        <button
          class="w-10 h-10 rounded-xl bg-transparent border-none text-white/30 text-2xl cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/5 hover:scale-105 z-10"
          aria-label="Close"
          onClick={handleClose}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image Preview */}
      <div class="animate-fadeInUp opacity-0 [animation-delay:0.1s] mb-3">
        <div
          class="relative w-full max-h-[35vh] overflow-hidden rounded-xl bg-black/20 cursor-pointer"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={props.onFullscreen}
        >
          {/* Like button on image */}
          <button
            class="absolute top-2 left-2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            onClick={(e) => { e.stopPropagation(); props.onToggleFinish(props.quoteViewIndex) }}
          >
            {isLiked(props.quoteViewIndex) ? (
              <svg class="w-5 h-5" style={{ color: '#ff6b6b' }} viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            ) : (
              <svg class="w-5 h-5 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            )}
          </button>

          {/* Navigation arrows */}
          <Show when={props.results.length > 1}>
            <button
              class="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:text-white hover:bg-black/50"
              style={{ background: 'rgba(0,0,0,0.3)' }}
              onClick={(e) => { e.stopPropagation(); handlePrev() }}
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:text-white hover:bg-black/50"
              style={{ background: 'rgba(0,0,0,0.3)' }}
              onClick={(e) => { e.stopPropagation(); handleNext() }}
            >
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </Show>

          <Show when={currentResult()?.image}>
            <img
              class="w-full max-h-[35vh] object-contain"
              src={currentResult()?.image}
              alt={currentResult()?.label}
            />
          </Show>
          <Show when={!currentResult()?.image && currentResult()?.loading}>
            <div class="w-full h-48 flex items-center justify-center text-white/40">
              <span>Loading...</span>
            </div>
          </Show>
          <Show when={!currentResult()?.image && !currentResult()?.loading}>
            <div class="w-full h-48 flex flex-col items-center justify-center text-white/40 gap-2">
              <svg class="w-8 h-8 text-red-400/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <span class="text-sm">Failed to render</span>
            </div>
          </Show>
        </div>

        {/* Showing: indicator */}
        <p class="text-xs text-center mt-2">
          <span class="text-white/50">Showing: </span>
          <span class="text-zeno-cyan font-medium">{currentResult()?.label.replace(' (Original)', '')}</span>
        </p>
      </div>

      {/* WheelFinishSelector - horizontal swatches with like buttons below */}
      <div class="animate-fadeInUp opacity-0 [animation-delay:0.15s] mb-4">
        <p class="text-xs uppercase tracking-[1px] text-white/50 mb-2 text-center">Select finishes you're interested in</p>
        <div class="flex gap-3 justify-center overflow-x-auto scrollbar-hide py-2 px-1">
          <For each={props.results}>
            {(result, i) => {
              const hasRefImage = () => !!result.referenceImage
              if (!hasRefImage()) return null

              return (
                <div class="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    class={`w-12 h-12 rounded-xl cursor-pointer border-2 transition-all bg-white overflow-hidden p-0 ${
                      props.quoteViewIndex === i()
                        ? 'border-white scale-105 shadow-[0_0_10px_rgba(255,255,255,0.2)]'
                        : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                    title={result.label.replace(' (Original)', '')}
                    onClick={() => props.onQuoteViewIndexChange(i())}
                  >
                    <img class="w-full h-full object-contain" src={result.referenceImage!} alt={result.label.replace(' (Original)', '')} />
                  </button>
                  {/* Like button below swatch */}
                  <button
                    type="button"
                    class={`w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110 ${
                      isLiked(i()) ? 'bg-red-500/20' : 'bg-white/5'
                    }`}
                    onClick={() => props.onToggleFinish(i())}
                    title={isLiked(i()) ? 'Remove from quote' : 'Add to quote'}
                  >
                    <svg
                      class="w-4 h-4"
                      style={{ color: isLiked(i()) ? '#ff6b6b' : 'rgba(255,255,255,0.4)' }}
                      viewBox="0 0 24 24"
                      fill={isLiked(i()) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                  </button>
                </div>
              )
            }}
          </For>
        </div>
      </div>

      {/* Form */}
      <form class="flex flex-col gap-2.5 max-w-[400px] w-full mx-auto" onSubmit={handleSubmit}>
        <div class="animate-fadeInUp opacity-0 [animation-delay:0.2s]">
          <input
            type="text"
            name="name"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Name *"
            required
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.25s]">
          <input
            type="email"
            name="email"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Email *"
            required
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.3s]">
          <div class="relative">
            <input
              type="text"
              name="vehicle"
              class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
              placeholder="Your Vehicle *"
              required
              value={vehicle()}
              onInput={(e) => setVehicle(e.currentTarget.value)}
            />
          </div>
          <Show when={props.detectedVehicle}>
            <p class="text-[11px] text-white/40 mt-1 pl-3.5">
              Vehicle <span class="text-zeno-cyan/70">(auto-detected)</span>
            </p>
          </Show>
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.35s]">
          <input
            type="tel"
            name="phone"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Phone (optional)"
            value={phone()}
            onInput={(e) => setPhone(e.currentTarget.value)}
          />
        </div>

        <Show when={error()}>
          <div class="text-xs text-red-400 mt-1 ml-1">{error()}</div>
        </Show>

        <div class="relative w-full animate-fadeInUp opacity-0 [animation-delay:0.45s] mt-1">
          <button
            type="submit"
            class="relative w-full py-3.5 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white text-zeno-card border-none hover:bg-gray-100 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting() || props.interestedFinishes.length === 0}
          >
            {isSubmitting() ? 'Processing...' : `Submit${props.interestedFinishes.length > 0 ? ` (${props.interestedFinishes.length} selected)` : ''}`}
          </button>
        </div>
      </form>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-3 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
