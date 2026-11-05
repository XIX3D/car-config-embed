import { For, Show } from "solid-js";
import type { RenderResult, DebugData, LoadingStep } from "../../types";
import { Frame } from "./Frame";
import { LoadingOverlay } from "./LoadingView";
import { DebugPanel } from "../Debug/DebugPanel";
import { IconClock, IconFull, IconSpark, IconSwap } from "./icons";

const DEBUG = import.meta.env.VITE_DEBUG === "true";

interface ResultViewProps {
  phone: boolean;
  ar: number;
  modelName: string;
  /** Finished renders, in the order they were made. */
  results: RenderResult[];
  current: RenderResult | null;
  /** Another finish is still rendering. */
  pending: boolean;
  /** Show the live animation on the picture (the next finish is on its way). */
  showLoading: boolean;
  loadingSteps: LoadingStep[];
  loadingStep: number;
  showOriginal: boolean;
  limitReached: boolean;
  /** Every finish has been rendered on this photo: More finishes becomes New photo. */
  allDone: boolean;
  /** A dealer's code: the visitor picks another wheel, not another finish of one wheel. */
  moreWheels?: boolean;
  debugData?: DebugData | null;
  onSelect: (id: number) => void;
  onNext: () => void;
  onToggleOriginal: () => void;
  onFullscreen: () => void;
  onMore: () => void;
  onQuote: () => void;
  onAspect: (ar: number) => void;
}

/**
 * S2: the render fills the window. Under it, one bar: the renders made (no count, no empty
 * boxes), what is on screen, More finishes, Request quote. At the limit the caption becomes the
 * limit card and More finishes goes.
 */
export function ResultView(props: ResultViewProps) {
  const src = () => (props.showOriginal ? props.current?.photo : props.current?.image) || "";

  const Strip = () => (
    <div class="xw-ths">
      <For each={props.results}>
        {(r) => (
          <button
            type="button"
            class={`xw-th ${r.id === props.current?.id ? "on" : ""}`}
            aria-label={r.label}
            onClick={() => props.onSelect(r.id)}
          >
            <img src={r.image} alt="" />
          </button>
        )}
      </For>
      <Show when={props.pending}>
        <div class="xw-th sk" aria-hidden="true" />
      </Show>
    </div>
  );

  const Caption = () => (
    <Show
      when={props.limitReached && !props.showOriginal}
      fallback={
        <div class="xw-cap">
          <Show when={!props.showOriginal} fallback={<b>Your photo</b>}>
            <b>{props.modelName}</b>
            <span>{props.current?.label}</span>
          </Show>
        </div>
      }
    >
      <div class="xw-cap capped">
        <i class="xw-ci"><IconClock /></i>
        <div>
          <b>You've hit your limit</b>
          <span>Please come back later</span>
        </div>
      </div>
    </Show>
  );

  const More = () => (
    <Show when={!props.limitReached}>
      <button type="button" class="xw-more" onClick={() => props.onMore()}>
        {props.allDone ? "New photo" : props.moreWheels ? "More wheels" : "More finishes"}
      </button>
    </Show>
  );

  const Quote = () => (
    <button type="button" class="xw-btn" onClick={() => props.onQuote()}>
      <IconSpark />
      Request quote
    </button>
  );

  return (
    <Frame
      phone={props.phone}
      ar={props.ar}
      picClass={`${props.results.length > 1 ? "nx" : ""} ${props.showLoading ? "ld" : ""}`}
      onPicClick={() => props.results.length > 1 && props.onNext()}
      pic={
        <>
          <img
            class="xw-fg"
            src={src()}
            alt=""
            draggable={false}
            onLoad={(e) => props.onAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          />
          <Show when={props.showLoading}>
            <LoadingOverlay steps={props.loadingSteps} step={props.loadingStep} />
          </Show>
          <button
            class="xw-ib tr"
            aria-label="Compare with your photo"
            aria-pressed={props.showOriginal}
            onClick={(e) => {
              e.stopPropagation();
              props.onToggleOriginal();
            }}
          >
            <IconSwap />
          </button>
          <button
            class="xw-ib br"
            aria-label="Full screen"
            onClick={(e) => {
              e.stopPropagation();
              props.onFullscreen();
            }}
          >
            <IconFull />
          </button>
          <Show when={DEBUG && props.debugData}>
            <DebugPanel debugData={props.debugData!} />
          </Show>
        </>
      }
      bar={
        <>
          <Strip />
          <Caption />
          <More />
          <Quote />
        </>
      }
      phoneUnder={
        <>
          <Caption />
          <Strip />
        </>
      }
      phoneBar={
        <>
          <More />
          <Quote />
        </>
      }
    />
  );
}
