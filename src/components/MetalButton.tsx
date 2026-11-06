import { createSignal, Show, type JSX } from "solid-js";
import { ChromaticMetalShader, CTA_HOT_SPEED, GLASS_FLARE_COLORS, LABEL_WELL, PILL_METAL, SPARKLE_PATH } from "./MetalShader";

interface MetalButtonProps {
  /** Classes for sizing and shape ("xw-cta" in the window); the look itself is the studio's. */
  class?: string;
  /** The page button's class, so the embed finds it. */
  ariaLabel?: string;
  disabled?: boolean;
  onClick?: () => void;
  /** The flare ring's thickness: 2.5px on a pill, 4px on a tall button, as the studio has them. */
  ring?: string;
  /** Keep the shader running on a phone too: this is the button a visitor looks at. */
  children: JSX.Element;
}

/**
 * The studio's animated Render button, built as the studio builds it (RenderCta / MetalCta): the
 * liquid-metal shader, a dark scrim over it, the turning flare ring, a white rim, and the label
 * (a sparkle, then the words) on its own soft dark well. Pointing at it makes the metal churn
 * faster, and a button with nothing to render keeps its metal, only slower and without the ring.
 */
export function MetalButton(props: MetalButtonProps) {
  const [hot, setHot] = createSignal(false);

  return (
    <button
      type="button"
      class={`zeno-cta ${props.class ?? ""}`}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onClick={() => props.onClick?.()}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={() => setHot(false)}
      style={{ "clip-path": "inset(0 round 9999px)" }}
    >
      <ChromaticMetalShader
        settings={PILL_METAL}
        size={64}
        forceLive
        speed={() => (props.disabled ? 0.6 : hot() ? CTA_HOT_SPEED : 1)}
        style={{ position: "absolute", inset: "0", width: "100%", height: "100%", "box-shadow": "none" }}
      />
      <span
        aria-hidden="true"
        class="zeno-cta-scrim"
        style={{ background: props.disabled ? "rgba(10,11,20,0.42)" : "linear-gradient(180deg,rgba(6,4,14,0.20),rgba(6,4,14,0.46))" }}
      />
      <Show when={!props.disabled}>
        <span
          aria-hidden="true"
          class="rgb-gs-ring"
          style={{
            "--zeno-gs-thickness": props.ring ?? "2.5px",
            "--zeno-gs-speed": "8s",
            "--zeno-gs-colors": GLASS_FLARE_COLORS.join(", "),
            "mix-blend-mode": "screen",
          }}
        />
      </Show>
      <span aria-hidden="true" class="zeno-cta-rim" />
      <span class="zeno-cta-label" style={{ background: LABEL_WELL }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.55))" }}>
          <path d={SPARKLE_PATH} fill="#fff" />
        </svg>
        {props.children}
      </span>
    </button>
  );
}
