import type { ButtonTheme, ButtonSize } from '../types'

interface ZenoButtonProps {
  text?: string
  theme?: ButtonTheme
  size?: ButtonSize
  onClick: () => void
}

/**
 * The button on the brand's or dealer's own page: the studio's animated AI button (the same
 * look as the Render button inside the window). Its styles are in styles/page.css.
 */
export function ZenoButton(props: ZenoButtonProps) {
  const text = () => props.text || 'Preview on Your Car'

  return (
    <button class={`avacar-btn-zeno${props.size === 'compact' ? ' avacar-compact' : ''}`} onClick={() => props.onClick()}>
      <svg class="avacar-zeno-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z" />
      </svg>

      <span class="avacar-zeno-label">{text()}</span>
    </button>
  )
}
