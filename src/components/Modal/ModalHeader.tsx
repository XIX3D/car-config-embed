import { Show } from "solid-js";
import { IconX } from "./icons";

interface ModalHeaderProps {
  brandName: string;
  modelName: string;
  productImgUrl?: string;
  onClose: () => void;
}

/** "Brand Wheel", Powered by xix3D under it, and the window's one X.
 *  Never cut (dealer notes, 18 November, p9: "ZZ Test - Test Co - Brixton Forged TR04 Aero+ 1-Piece Wheel" ran off a
 *  phone in "..."): the name wraps instead, the brand in a lighter weight so brand and wheel read as two names without
 *  a dash (a brand's own name can carry one), and "1-Piece" never splits across lines. */
export function ModalHeader(props: ModalHeaderProps) {
  return (
    <div class="xw-hd">
      <div class="xw-mark">
        <Show when={props.productImgUrl} fallback={<span class="xw-mk-l">{props.brandName.trim().charAt(0).toUpperCase()}</span>}>
          <img src={props.productImgUrl} alt="" />
        </Show>
      </div>
      <div class="xw-name">
        <Show when={props.modelName} fallback={props.brandName}>
          <span class="xw-br">{props.brandName}</span> {props.modelName.replace(/-/g, "‑")}
        </Show>
        <small>
          Powered by{" "}
          {/* xix3D's own site, not the render app (dealer notes, 18 November). */}
          <a href="https://xix3d.com" target="_blank" rel="noopener noreferrer">xix3D</a>
        </small>
      </div>
      <button class="xw-round" aria-label="Close" onClick={() => props.onClose()}>
        <IconX />
      </button>
    </div>
  );
}
