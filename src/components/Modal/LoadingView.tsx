import { For, Show } from "solid-js";
import type { LoadingStep } from "../../types";
import { Frame } from "./Frame";

/**
 * Rough remaining time, from what is left of the script.
 *
 * Quoting a fixed "~30 seconds" was close enough on v1 (~23s) but is wrong for a cold
 * two-pass render (~45s), and an estimate the user watches expire is worse than none.
 * Rounding to a coarse bucket keeps it honest without implying precision the render does
 * not have.
 */
function remainingLabel(steps: LoadingStep[], currentStep: number): string {
  const remainingMs = steps
    .slice(currentStep)
    .reduce((total, step) => total + step.duration, 0);

  if (remainingMs > 40000) return "About a minute";
  if (remainingMs > 25000) return "~45 seconds";
  if (remainingMs > 12000) return "~30 seconds";
  if (remainingMs > 6000) return "Almost there";

  return "Finishing up...";
}

function createLoadingText(text: string) {
  return text.split("").map((char, i) => ({
    char: char === " " ? " " : char,
    delay: i * 0.1,
  }));
}

/**
 * The studio's render animation: the white and blue glow turning round the picture's edge and
 * the step spelled in pulsing letters. Laid over a photo whose brightness is dropped (`.ld`).
 */
export function LoadingOverlay(props: { steps: LoadingStep[]; step: number; photo?: string | null; cutout?: string | null }) {
  const letters = () => createLoadingText(props.steps[props.step]?.text || "");

  return (
    <>
      {/* The server's cut-out of the wheels: they come up bright against the dimmed photo, with a soft glow round their edge. */}
      <Show when={props.cutout && props.photo}>
        <div class="xw-lift" style={{ "--cut": `url(${props.cutout})` }}>
          <div class="halo" />
          <img src={props.photo!} alt="" draggable={false} />
        </div>
      </Show>
      <i class="xw-glow" />
      <div class="xw-lvo">
        <div style={{ display: "flex", "justify-content": "center" }}>
          <For each={letters()}>
            {(letter) => (
              <span class="avacar-loading-letter" style={{ "animation-delay": `${letter.delay}s` }}>
                {letter.char}
              </span>
            )}
          </For>
        </div>
      </div>
    </>
  );
}

interface LoadingViewProps {
  phone: boolean;
  ar: number;
  previewDataUrl: string | null;
  loadingSteps: LoadingStep[];
  currentStep: number;
  /** The wheel cut-out the server sent for this photo, once its mask is made. */
  cutout?: string | null;
  onAspect: (ar: number) => void;
}

/** S1: the photo the visitor gave, dimmed, with the animation, and the time line under it. */
export function LoadingView(props: LoadingViewProps) {
  const isLongWait = () => props.currentStep >= props.loadingSteps.length - 2;

  return (
    <Frame
      phone={props.phone}
      ar={props.ar}
      picClass="ld"
      pic={
        <>
          <img
            class="xw-fg"
            src={props.previewDataUrl ?? ""}
            alt=""
            draggable={false}
            onLoad={(e) => props.onAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          />
          <LoadingOverlay steps={props.loadingSteps} step={props.currentStep} photo={props.previewDataUrl} cutout={props.cutout} />
        </>
      }
      under={
        <p class="xw-lvr">
          {isLongWait() ? "This may take a moment..." : remainingLabel(props.loadingSteps, props.currentStep)}
        </p>
      }
    />
  );
}
