import { Show } from "solid-js";
import type { LoadingStep } from "../../types";
import { Frame } from "./Frame";
import { IconSpark } from "./icons";

/**
 * WHILE IT RENDERS, THE RENDER.XIX3D SCREEN (dealer notes, 18 November: "Old visualizer loading animation is back?").
 * The old widget's animation (a glow turning round the edge, the step spelled in pulsing letters, "This may take a
 * moment...") is gone. As on render.xix3D's render page: the photo dimmed, the wheels the server found lifting out of
 * it once it has them, the metal orb with its star, and one word, "Rendering", with "2 of 5" when several are coming.
 * The orb is the window's own CSS one (the upload screen's), not a WebGL canvas on the dealer's page.
 */
export function LoadingOverlay(props: { photo?: string | null; cutout?: string | null; of?: { n: number; total: number } | null }) {
  return (
    <>
      {/* The server's cut-out of the wheels: they come up bright against the dimmed photo, with a soft glow round their edge. */}
      <Show when={props.cutout && props.photo}>
        <div class="xw-lift" style={{ "--cut": `url(${props.cutout})` }}>
          <div class="halo" />
          <img src={props.photo!} alt="" draggable={false} />
        </div>
      </Show>
      <div class={`xw-lvo ${props.cutout ? "low" : ""}`} role="status">
        <div class="xw-orb sm" aria-hidden="true"><IconSpark /></div>
        <b>Rendering</b>
        <Show when={props.of && props.of.total > 1}>
          <span>{props.of!.n} of {props.of!.total}</span>
        </Show>
      </div>
    </>
  );
}

interface LoadingViewProps {
  phone: boolean;
  ar: number;
  previewDataUrl: string | null;
  /** Kept for the callers; the screen no longer spells the steps. */
  loadingSteps?: LoadingStep[];
  currentStep?: number;
  /** Which render of the batch is being made, for "2 of 5". */
  of?: { n: number; total: number } | null;
  /** The wheel cut-out the server sent for this photo, once its mask is made. */
  cutout?: string | null;
  onAspect: (ar: number) => void;
}

/** S1: the photo the visitor gave, dimmed, with the render screen over it. */
export function LoadingView(props: LoadingViewProps) {
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
          <LoadingOverlay photo={props.previewDataUrl} cutout={props.cutout} of={props.of} />
        </>
      }
      under={<p class="xw-lvr" aria-hidden="true" />}
    />
  );
}
