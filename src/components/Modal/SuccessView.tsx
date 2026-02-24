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

  return (
    <div class="avacar-success-view">
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

      <div class="avacar-success-content">
        <div class="avacar-success-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 class="avacar-success-title">Thank you!</h2>
        <p class="avacar-success-message">
          {props.isWraps ? 'A wrap specialist' : 'A wheel specialist'} will contact you shortly
        </p>

        <Show when={selectedResults().length > 0}>
          <div class="avacar-success-finishes">
            <p class="avacar-success-finishes-label">Interested in:</p>
            <div class="avacar-success-finishes-list">
              <For each={selectedResults()}>
                {(result) => (
                  <div class="avacar-success-finish-item">
                    <div
                      class="avacar-success-finish-color"
                      style={{ background: result.hexColor || '#ccc' }}
                    />
                    <span class="avacar-success-finish-name">
                      {result.label.replace(' (Original)', '')}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="avacar-success-actions">
          <div class="avacar-action-btn secondary">
            <button onClick={props.onShare}>
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

      <div class="avacar-footer">Powered by <strong>Zeno</strong></div>
    </div>
  )
}
