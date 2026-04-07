import type { ButtonTheme, ButtonSize } from '../types'

interface ZenoButtonProps {
  text?: string
  theme?: ButtonTheme
  size?: ButtonSize
  onClick: () => void
}

const StarPath = () => (
  <path d="M9 0.5L10.9 7.1L17.5 9L10.9 10.9L9 17.5L7.1 10.9L0.5 9L7.1 7.1L9 0.5Z" fill="white" />
)

export function ZenoButton(props: ZenoButtonProps) {
  const text = () => props.text || 'Preview on Your Car'

  return (
    <button class="avacar-btn-zeno" onClick={() => props.onClick()}>
      <div class="avacar-zeno-shimmer" />

      <div class="avacar-zeno-icon-system">
        <svg class="avacar-star-main" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <StarPath />
        </svg>

        <div class="avacar-orbit avacar-orbit-1">
          <svg class="avacar-star-mini" width="6" height="6" viewBox="0 0 18 18" fill="none">
            <StarPath />
          </svg>
        </div>

        <div class="avacar-orbit avacar-orbit-2">
          <svg class="avacar-star-mini" width="5" height="5" viewBox="0 0 18 18" fill="none">
            <StarPath />
          </svg>
        </div>

        <div class="avacar-orbit avacar-orbit-3">
          <svg class="avacar-star-mini" width="4" height="4" viewBox="0 0 18 18" fill="none">
            <StarPath />
          </svg>
        </div>
      </div>

      <span class="avacar-zeno-label">{text()}</span>
    </button>
  )
}
