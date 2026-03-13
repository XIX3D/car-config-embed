import { Show, createSignal } from 'solid-js'

interface TruncatedTitleProps {
  text: string
  class?: string
}

export function TruncatedTitle(props: TruncatedTitleProps) {
  let textRef: HTMLSpanElement | undefined
  const [showTooltip, setShowTooltip] = createSignal(false)
  const [isTruncated, setIsTruncated] = createSignal(false)
  let hideTimeout: number | undefined

  const checkTruncation = () => {
    if (textRef) {
      setIsTruncated(textRef.scrollWidth > textRef.clientWidth)
    }
  }

  const handleMouseEnter = () => {
    clearTimeout(hideTimeout)
    checkTruncation()
    if (isTruncated()) setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    hideTimeout = window.setTimeout(() => setShowTooltip(false), 100)
  }

  return (
    <div
      class="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        ref={textRef}
        class={`block max-w-[180px] truncate ${props.class || ''}`}
      >
        {props.text}
      </span>
      <Show when={showTooltip()}>
        <div
          class="absolute left-1/2 -translate-x-1/2 bottom-full px-3 py-1.5 bg-black/90 backdrop-blur-sm text-white text-sm rounded-lg whitespace-nowrap z-[9999999] shadow-lg border border-white/10 animate-fadeIn"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div class="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-black/90 border-r border-b border-white/10 rotate-45" />
          <span class="relative z-10">{props.text}</span>
        </div>
        {/* Invisible bridge to connect text and tooltip */}
        <div class="absolute left-0 right-0 bottom-full h-2" />
      </Show>
    </div>
  )
}
