import type { ButtonTheme, ButtonSize } from '../types'
import { MetalButton } from './MetalButton'

interface ZenoButtonProps {
  text?: string
  theme?: ButtonTheme
  size?: ButtonSize
  onClick: () => void
}

/**
 * The button on a brand's or dealer's own page: the studio's animated Render button itself (the
 * live liquid-metal shader, the turning flare ring), not a lookalike. Sizes are in styles/page.css.
 */
export function ZenoButton(props: ZenoButtonProps) {
  const text = () => props.text || 'Preview on Your Car'

  return (
    <MetalButton class={`avacar-btn-zeno${props.size === 'compact' ? ' avacar-compact' : ''}`} onClick={() => props.onClick()}>
      <span class="avacar-zeno-label">{text()}</span>
    </MetalButton>
  )
}
