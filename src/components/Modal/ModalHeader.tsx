import { Show } from "solid-js";
import { IconX } from "./icons";

interface ModalHeaderProps {
  brandName: string;
  modelName: string;
  productImgUrl?: string;
  onClose: () => void;
}

/** "Brand - Wheel", Powered by xix3D under it, and the window's one X. */
export function ModalHeader(props: ModalHeaderProps) {
  return (
    <div class="xw-hd">
      <div class="xw-mark">
        <Show when={props.productImgUrl} fallback={<span class="xw-mk-l">{props.brandName.trim().charAt(0).toUpperCase()}</span>}>
          <img src={props.productImgUrl} alt="" />
        </Show>
      </div>
      <div class="xw-name">
        {props.modelName ? `${props.brandName} - ${props.modelName}` : props.brandName}
        <small>Powered by xix3D</small>
      </div>
      <button class="xw-round" aria-label="Close" onClick={() => props.onClose()}>
        <IconX />
      </button>
    </div>
  );
}
