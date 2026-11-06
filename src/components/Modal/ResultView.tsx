import { For, Show } from "solid-js";
import type { RenderResult, DebugData } from "../../types";
import { Frame } from "./Frame";
import { ZoomPane } from "./ZoomPane";
import { DebugPanel } from "../Debug/DebugPanel";
import { IconClock, IconFull, IconSpark, IconSwap } from "./icons";

const DEBUG = import.meta.env.VITE_DEBUG === "true";

interface ResultViewProps {
  phone: boolean;
  ar: number;
  modelName: string;
  /** Every render of this visit, finished or still on its way, in the order they were asked for. */
  slots: RenderResult[];
  current: RenderResult | null;
  /** Another render is still on its way: the photo cannot be swapped yet. */
  pending: boolean;
  limitReached: boolean;
  /** Every finish has been rendered on this photo: Another finish becomes New photo. */
  allDone: boolean;
  /** A dealer's code: the visitor picks another wheel, not another finish of one wheel. */
  moreWheels?: boolean;
  debugData?: DebugData | null;
  onSelect: (id: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onFullscreen: () => void;
  onChangePhoto: () => void;
  onMore: () => void;
  onQuote: () => void;
  onAspect: (ar: number) => void;
}

/**
 * S2: the render fills the window. Under it, one bar: a thumbnail for each render (the wheel it
 * shows, so the strip reads as "the wheels I tried"; a render still on its way is a dimmed one
 * with a ring), what is on screen, More wheels, Request quote. Renders already finished can be
 * opened while the rest are still coming. At the limit the caption becomes the limit card.
 */
export function ResultView(props: ResultViewProps) {
  const Thumb = (t: { r: RenderResult }) => {
    const wheel = () => t.r.referenceImage;

    return (
      <span class="xw-thw" style={!wheel() && t.r.hexColor ? { background: t.r.hexColor } : undefined}>
        <Show when={wheel()} fallback={<Show when={!t.r.hexColor && t.r.image}><img class="cover" src={t.r.image} alt="" /></Show>}>
          <img src={wheel()!} alt="" draggable={false} />
        </Show>
      </span>
    );
  };

  const Strip = () => (
    <div class="xw-ths">
      <For each={props.slots}>
        {(r) => (
          <Show
            when={!r.loading}
            fallback={
              <div class="xw-th pend" aria-label={`${r.label} is rendering`}>
                <Thumb r={r} />
                <i class="xw-th-sp" />
              </div>
            }
          >
            <button
              type="button"
              class={`xw-th ${r.id === props.current?.id ? "on" : ""}`}
              aria-label={`${r.productName ? r.productName + " " : ""}${r.label}`}
              title={`${r.productName ? r.productName + ", " : ""}${r.label}`}
              onClick={() => props.onSelect(r.id)}
            >
              <Thumb r={r} />
            </button>
          </Show>
        )}
      </For>
    </div>
  );

  const Caption = () => (
    <Show
      when={props.limitReached}
      fallback={
        <div class="xw-cap">
          <b>{props.modelName}</b>
          <span>{props.current?.label}</span>
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
        {props.allDone ? "New photo" : props.moreWheels ? "More wheels" : "Another finish"}
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
      pic={
        <ZoomPane
          src={props.current?.image || ""}
          original={props.current?.photo}
          onNext={props.onNext}
          onPrev={props.onPrev}
          onAspect={props.onAspect}
        >
          <button
            class="xw-ib tr"
            aria-label="Change the car photo"
            title={props.pending ? "Finish rendering first" : "Change the car photo"}
            disabled={props.pending}
            onClick={(e) => {
              e.stopPropagation();
              props.onChangePhoto();
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
        </ZoomPane>
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
