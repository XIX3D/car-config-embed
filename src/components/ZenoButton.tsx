import { For } from 'solid-js'
import type { ButtonTheme, ButtonSize } from '../types'

interface ZenoButtonProps {
  text?: string
  theme?: ButtonTheme
  size?: ButtonSize
  onClick: () => void
}

const StarSvg = () => (
  <svg viewBox="0 0 24 24">
    <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" />
  </svg>
)

const MainIconSvg = () => (
  <svg viewBox="0 0 24 24">
    <path d="M12 2L9.5 9.5L2 12L9.5 14.5L12 22L14.5 14.5L22 12L14.5 9.5L12 2Z" />
  </svg>
)

export function ZenoButton(props: ZenoButtonProps) {
  const text = () => props.text || 'Preview on Your Car'
  const theme = () => props.theme || 'light'
  const size = () => props.size || 'standard'

  const letters = () => {
    const result: Array<{ type: 'letter' | 'space'; char?: string }> = []
    for (const char of text()) {
      if (char === ' ') {
        result.push({ type: 'space' })
      } else {
        result.push({ type: 'letter', char })
      }
    }
    return result
  }

  return (
    <div
      class={`avacar-btn-zeno ${theme() === 'dark' ? 'dark-mode' : 'light-mode'} size-${size()}`}
      onClick={props.onClick}
    >
      <div class="avacar-zeno-bg" />
      <div class="avacar-zeno-inner">
        <div class="avacar-zeno-icon">
          <span class="avacar-sparkle avacar-sp-1"><StarSvg /></span>
          <span class="avacar-sparkle avacar-sp-2"><StarSvg /></span>
          <span class="avacar-sparkle avacar-sp-3"><StarSvg /></span>
          <span class="avacar-sparkle avacar-sp-4"><StarSvg /></span>
          <MainIconSvg />
        </div>
        <span class="avacar-zeno-text">
          <For each={letters()}>
            {(item) =>
              item.type === 'space' ? (
                <span class="avacar-space" />
              ) : (
                <span class="avacar-letter">{item.char}</span>
              )
            }
          </For>
        </span>
      </div>
    </div>
  )
}
