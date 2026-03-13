import { createSignal, For } from 'solid-js'
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
  onClose: () => void
  onBack: () => void
  onToggleFinish: (index: number) => void
  onSubmit: (customer: CustomerData, vehicle: string) => Promise<void>
}

export function QuoteView(props: QuoteViewProps) {
  const getInitialVehicle = () => props.detectedVehicle || ''
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [phone, setPhone] = createSignal('')
  const [vehicle, setVehicle] = createSignal(getInitialVehicle())
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  const handleClose = () => props.onClose()
  const handleBack = () => props.onBack()

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
    <div class="relative z-1 p-6 flex flex-col min-h-[520px]">
      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp">
        <button
          class="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/10 hover:border-white/20 flex-shrink-0"
          aria-label="Back"
          onClick={handleBack}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="flex items-center gap-3 mx-auto">
          <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {props.productImgUrl ? (
              <img class="w-11 h-11 rounded-full object-cover" src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div class="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
            )}
          </div>
          <div class="flex flex-col">
            <span class="text-[10px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle text={props.modelName} class="text-xl font-semibold text-white" />
          </div>
        </div>
        <button
          class="w-10 h-10 rounded-xl bg-transparent border-none text-white/30 text-2xl cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/5 hover:scale-105 z-10"
          aria-label="Close"
          onClick={handleClose}
        >
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Finishes Display */}
      <div class="animate-fadeInUp opacity-0 [animation-delay:0.15s] mb-5">
        <p class="text-xs uppercase tracking-[1px] text-white/50 mb-3 text-center">Select finishes you're interested in</p>
        <div class="flex flex-wrap gap-3 justify-center">
          <For each={props.results}>
            {(result, i) => (
              <button
                type="button"
                class={`flex-shrink-0 w-14 h-14 rounded-xl cursor-pointer border-2 transition-all opacity-50 bg-white overflow-hidden p-0 ${
                  props.interestedFinishes.includes(i())
                    ? 'opacity-100 scale-110 border-zeno-green shadow-[0_0_0_2px_rgba(70,255,129,0.4),0_0_15px_rgba(70,255,129,0.3)]'
                    : 'border-transparent hover:opacity-80 hover:scale-105'
                }`}
                title={result.label.replace(' (Original)', '')}
                onClick={() => props.onToggleFinish(i())}
              >
                {result.referenceImage ? (
                  <img class="w-full h-full object-contain" src={result.referenceImage} alt={result.label.replace(' (Original)', '')} />
                ) : (
                  <div class="w-full h-full" style={{ 'background-color': result.hexColor || '#ccc' }} />
                )}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Form */}
      <form class="flex flex-col gap-3 max-w-[400px] w-full mx-auto" onSubmit={handleSubmit}>
        <div class="animate-fadeInUp opacity-0 [animation-delay:0.2s]">
          <input
            type="text"
            name="name"
            class="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
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
            class="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Email *"
            required
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.3s]">
          <input
            type="text"
            name="vehicle"
            class="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Vehicle *"
            required
            value={vehicle()}
            onInput={(e) => setVehicle(e.currentTarget.value)}
          />
          {props.detectedVehicle && (
            <p class="text-[11px] text-zeno-green mt-1.5 flex items-center gap-1 pl-4">
              <span class="w-1.5 h-1.5 rounded-full bg-zeno-green" />
              Identified from your photo
            </p>
          )}
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.35s]">
          <input
            type="tel"
            name="phone"
            class="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-franie transition-all outline-none focus:border-zeno-cyan/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Phone (optional)"
            value={phone()}
            onInput={(e) => setPhone(e.currentTarget.value)}
          />
        </div>

        {error() && (
          <div class="text-xs text-red-400 mt-1 ml-1">{error()}</div>
        )}

        <div class="relative w-full animate-fadeInUp opacity-0 [animation-delay:0.45s]">
          <button
            type="submit"
            class="relative w-full py-4 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white text-zeno-card border-none hover:bg-gray-100 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isSubmitting()}
          >
            {isSubmitting() ? 'Processing...' : 'Submit'}
          </button>
        </div>
      </form>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
