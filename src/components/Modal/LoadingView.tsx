import { For } from 'solid-js'
import type { LoadingStep } from '../../types'
import { TruncatedTitle } from './TruncatedTitle'

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

  const handleClose = () => props.onClose()

  return (
    <div class="relative z-1 p-6 flex flex-col items-center text-center min-h-[520px]">
      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp">
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

      <h2 class="text-2xl font-semibold m-0 mb-6 text-white animate-fadeInUp">See it on Your Car</h2>

      {/* Image Container */}
      <div class="avacar-image-container generating">
        {props.previewDataUrl && (
          <img src={props.previewDataUrl} alt="Processing" />
        )}
        <div class="avacar-inner-glow" />
        <div class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0.2)_70%)]">
          <div class="flex justify-center">
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

      <p class="mt-4 text-sm text-white/40 animate-pulse">~30 seconds</p>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
