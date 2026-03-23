import { Show, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

interface TruncatedTitleProps {
  text: string;
  class?: string;
}

export function TruncatedTitle(props: TruncatedTitleProps) {
  let textRef: HTMLSpanElement | undefined;
  const [showTooltip, setShowTooltip] = createSignal(false);
  const [isTruncated, setIsTruncated] = createSignal(false);
  const [pos, setPos] = createSignal({ x: 0, y: 0 });
  let hideTimeout: number | undefined;

  const checkTruncation = () => {
    if (textRef) {
      setIsTruncated(textRef.scrollWidth > textRef.clientWidth);
    }
  };

  const updatePosition = () => {
    if (textRef) {
      const rect = textRef.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
  };

  const handleMouseEnter = () => {
    clearTimeout(hideTimeout);
    checkTruncation();
    if (isTruncated()) {
      updatePosition();
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    hideTimeout = window.setTimeout(() => setShowTooltip(false), 100);
  };

  onCleanup(() => clearTimeout(hideTimeout));

  return (
    <div
      class="relative w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span ref={textRef} class={`block truncate ${props.class || ""}`}>
        {props.text}
      </span>
      <Show when={showTooltip()}>
        <Portal>
          <div
            class="fixed px-3 py-1.5 bg-black/90 backdrop-blur-sm text-white text-sm rounded-lg whitespace-nowrap z-[9999999] shadow-lg border border-white/10 animate-fadeIn"
            style={{
              left: `${pos().x}px`,
              top: `${pos().y}px`,
              transform: "translate(-50%, calc(-100% - 8px))",
            }}
            onMouseEnter={() => clearTimeout(hideTimeout)}
            onMouseLeave={handleMouseLeave}
          >
            <div class="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-black/90 border-r border-b border-white/10 rotate-45" />
            <span class="relative z-10">{props.text}</span>
          </div>
        </Portal>
      </Show>
    </div>
  );
}
