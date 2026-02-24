import { createSignal, For } from 'solid-js'
import type { RenderResult, Customer } from '../../types'

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
  onSubmit: (customer: Customer, vehicle: string) => Promise<void>
}

export function QuoteView(props: QuoteViewProps) {
  console.log('QuoteView detectedVehicle:', props.detectedVehicle)
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [phone, setPhone] = createSignal('')
  const [vehicle, setVehicle] = createSignal(props.detectedVehicle || '')
  const [zipCode, setZipCode] = createSignal('')
  const [isSubmitting, setIsSubmitting] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

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
          zip_code: zipCode(),
        },
        vehicle()
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div class="avacar-quote-view">
      <div class="avacar-header">
        <button class="avacar-back-btn" aria-label="Back" onClick={props.onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div class="avacar-header-left">
          <div class="avacar-header-thumb">
            {props.productImgUrl ? (
              <img src={props.productImgUrl} alt={props.modelName} />
            ) : (
              <div style={{ width: '44px', height: '44px', 'border-radius': '50%', background: 'linear-gradient(135deg, #888, #666)' }} />
            )}
          </div>
          <div class="avacar-header-info">
            <span class="avacar-header-brand">{props.brandName}</span>
            <span class="avacar-header-model">{props.modelName}</span>
          </div>
        </div>
        <button class="avacar-close-btn" aria-label="Close" onClick={props.onClose}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="avacar-finishes-display">
        <p class="avacar-finishes-label">Select finishes you're interested in</p>
        <div class="avacar-finishes-thumbs">
          <For each={props.results}>
            {(result, i) => (
              <button
                type="button"
                class={`avacar-finish-thumb ${props.interestedFinishes.includes(i()) ? 'selected' : ''}`}
                title={result.label.replace(' (Original)', '')}
                onClick={() => props.onToggleFinish(i())}
              >
                {result.referenceImage ? (
                  <img src={result.referenceImage} alt={result.label.replace(' (Original)', '')} />
                ) : (
                  <div style={{ width: '100%', height: '100%', 'background-color': result.hexColor || '#ccc' }} />
                )}
              </button>
            )}
          </For>
        </div>
      </div>

      <form class="avacar-form" onSubmit={handleSubmit}>
        <div class="avacar-form-group" style={{ 'animation-delay': '0.2s' }}>
          <input
            type="text"
            name="name"
            class="avacar-form-input"
            placeholder="Your Name *"
            required
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div class="avacar-form-group" style={{ 'animation-delay': '0.25s' }}>
          <input
            type="email"
            name="email"
            class="avacar-form-input"
            placeholder="Your Email *"
            required
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>

        <div class="avacar-form-group" style={{ 'animation-delay': '0.3s' }}>
          <input
            type="text"
            name="vehicle"
            class="avacar-form-input"
            placeholder="Your Vehicle *"
            required
            value={vehicle()}
            onInput={(e) => setVehicle(e.currentTarget.value)}
          />
          {props.detectedVehicle && (
            <p class="avacar-vehicle-detected">Identified from your photo</p>
          )}
        </div>

        <div class="avacar-form-group" style={{ 'animation-delay': '0.35s' }}>
          <input
            type="tel"
            name="phone"
            class="avacar-form-input"
            placeholder="Phone (optional)"
            value={phone()}
            onInput={(e) => setPhone(e.currentTarget.value)}
          />
        </div>

        <div class="avacar-form-group" style={{ 'animation-delay': '0.4s' }}>
          <input
            type="text"
            name="zip_code"
            class="avacar-form-input"
            placeholder="Zip Code *"
            required
            value={zipCode()}
            onInput={(e) => setZipCode(e.currentTarget.value)}
          />
        </div>

        {error() && (
          <div class="avacar-form-error">{error()}</div>
        )}

        <div class="avacar-action-btn primary" style={{ 'animation-delay': '0.45s' }}>
          <button type="submit" disabled={isSubmitting()}>
            {isSubmitting() ? 'Processing...' : 'Submit'}
          </button>
        </div>
      </form>

      <div class="avacar-footer">Powered by <strong>Zeno</strong></div>
    </div>
  )
}
