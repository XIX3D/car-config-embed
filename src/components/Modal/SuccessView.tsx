import { Show, For } from 'solid-js'
import type { RenderResult } from '../../types'

interface SuccessViewProps {
  productImgUrl: string
  brandName: string
  modelName: string
  isWraps: boolean
  results: RenderResult[]
  interestedFinishes: number[]
  onClose: () => void
  onShare: () => void
}

export function SuccessView(props: SuccessViewProps) {
  const selectedResults = () =>
    props.interestedFinishes
      .map((i) => props.results[i])
      .filter(Boolean)

  const handleClose = () => props.onClose()
  const handleShare = () => props.onShare()

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
            <span class="text-xl font-semibold text-white">{props.modelName}</span>
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

      {/* Success Content */}
      <div class="flex-1 flex flex-col items-center justify-center py-4">
        <div class="w-20 h-20 rounded-full bg-gradient-to-br from-zeno-green to-zeno-cyan flex items-center justify-center mb-6 animate-successPop">
          <svg class="w-10 h-10 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 class="text-[28px] font-bold text-white m-0 mb-2">Thank you!</h2>
        <p class="text-[15px] text-white/40 m-0 mb-4">
          {props.isWraps ? 'A wrap specialist' : 'A wheel specialist'} will contact you shortly
        </p>

        <Show when={selectedResults().length > 0}>
          <div class="mb-6 p-4 rounded-xl bg-white/5 text-left w-full max-w-[280px] animate-fadeInUp opacity-0 [animation-delay:0.2s]">
            <p class="text-xs uppercase tracking-[1px] text-white/40 mb-2">Interested in:</p>
            <div class="flex flex-wrap gap-2">
              <For each={selectedResults()}>
                {(result) => (
                  <div class="flex items-center gap-2 py-1 px-2 rounded-md bg-white/5">
                    <div
                      class="w-3 h-3 rounded"
                      style={{ background: result.hexColor || '#ccc' }}
                    />
                    <span class="text-sm text-white/70">
                      {result.label.replace(' (Original)', '')}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="flex flex-col gap-3 w-full max-w-[280px]">
          <div class="relative w-full animate-fadeInUp">
            <button
              class="relative w-full py-4 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20"
              onClick={handleShare}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share to Social
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  )
}
