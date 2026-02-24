import { For } from 'solid-js'
import type { LoadingStep } from '../../types'

interface LoadingViewProps {
  productImgUrl: string
  brandName: string
  modelName: string
  previewDataUrl: string | null
  loadingSteps: LoadingStep[]
  currentStep: number
  onClose: () => void
}

function createLoadingText(text: string) {
  return text.split('').map((char, i) => ({
    char: char === ' ' ? '\u00A0' : char,
    delay: i * 0.1,
  }))
}

export function LoadingView(props: LoadingViewProps) {
  const loadingLetters = () => createLoadingText(props.loadingSteps[props.currentStep]?.text || '')

  return (
    <div class="avacar-loading-view">
      <div class="avacar-header">
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

      <h2 class="avacar-title-stylized">See it on Your Car</h2>

      <div class="avacar-image-container generating">
        {props.previewDataUrl && (
          <img src={props.previewDataUrl} alt="Processing" />
        )}
        <div class="avacar-inner-glow" />
        <div class="avacar-generating-overlay">
          <div class="avacar-loading-text">
            <For each={loadingLetters()}>
              {(letter) => (
                <span
                  class="avacar-loading-letter"
                  style={{ 'animation-delay': `${letter.delay}s` }}
                >
                  {letter.char}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>

      <p class="avacar-loading-hint">~30 seconds</p>

      <div class="avacar-footer">Powered by <strong>Zeno</strong></div>
    </div>
  )
}
