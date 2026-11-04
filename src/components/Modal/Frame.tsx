import { Show, type JSX } from "solid-js";

interface FrameProps {
  phone: boolean;
  /** The photo's shape, width over height. The picture keeps it; nothing is cropped. */
  ar: number;
  picClass?: string;
  onPicClick?: () => void;
  /** What fills the picture: the photo or render, and any buttons on it. */
  pic: JSX.Element;
  /** Under the picture on both layouts (the loading time line). */
  under?: JSX.Element;
  /** Desktop: the one bar under the picture, its edges on the picture's. */
  bar?: JSX.Element;
  /** Phone: what sits under the picture, and the buttons pinned at the bottom. */
  phoneUnder?: JSX.Element;
  phoneBar?: JSX.Element;
}

/**
 * The picture as big as the window allows, with its bar under it.
 *
 * Every screen that shows the car (photo and finishes, loading, result) draws it through this,
 * so the picture never moves or changes size from one screen to the next.
 */
export function Frame(props: FrameProps) {
  const style = () => ({ "--ar": String(props.ar) });
  const Pic = () => (
    <div class={`xw-pic ${props.picClass ?? ""}`} onClick={() => props.onPicClick?.()}>
      {props.pic}
    </div>
  );

  return (
    <Show
      when={props.phone}
      fallback={
        <div class="xw-fit">
          <div class="xw-col" style={style()}>
            <Pic />
            {props.under}
            <Show when={props.bar}>
              <div class="xw-ctl">{props.bar}</div>
            </Show>
          </div>
        </div>
      }
    >
      <div class="xw-pcol" style={style()}>
        <Pic />
        {props.under}
        {props.phoneUnder}
      </div>
      <Show when={props.phoneBar}>
        <div class="xw-pbar">{props.phoneBar}</div>
      </Show>
    </Show>
  );
}
