import { onCleanup, onMount } from "solid-js";
import { ZoomPane } from "./ZoomPane";
import { IconX } from "./icons";

interface FullViewProps {
  src: string;
  original?: string | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

/**
 * Full screen: the whole screen, not just the window. It asks the browser for real full screen
 * and, where a browser refuses (an iPhone does), still covers the whole page. Esc, or leaving full
 * screen, closes it. The picture zooms, pans and shows the photo on a press and hold as everywhere.
 */
export function FullView(props: FullViewProps) {
  let el: HTMLDivElement | undefined;

  onMount(() => {
    const asked = el?.requestFullscreen?.();

    asked?.catch(() => undefined);
    const left = () => {
      if (!document.fullscreenElement) props.onClose();
    };

    document.addEventListener("fullscreenchange", left);
    onCleanup(() => {
      document.removeEventListener("fullscreenchange", left);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    });
  });

  return (
    <div class="xw-fsv" ref={el} role="dialog" aria-label="Full screen">
      <ZoomPane src={props.src} original={props.original} fit="contain" onPrev={props.onPrev} onNext={props.onNext}>
        <button class="xw-ib tr" aria-label="Close full screen" onClick={() => props.onClose()}>
          <IconX />
        </button>
      </ZoomPane>
    </div>
  );
}
