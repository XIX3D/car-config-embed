import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";

const MAX_ZOOM = 5;
const WHEEL_STEP = 1.18;
const DOUBLE_TAP_ZOOM = 2.5;
/** A still press this long (ms) shows the visitor's own photo; moving first makes it a swipe or a pan. */
const HOLD_MS = 240;
/** A press that moves further than this (px) is not a hold. */
const MOVE_PX = 8;
const SWIPE_PX = 40;

interface ZoomPaneProps {
  src: string;
  /** The visitor's own photo, shown while the picture is pressed and held. */
  original?: string | null;
  fit?: "cover" | "contain";
  /** Left and right through the renders: swipe, and the arrow keys. */
  onPrev?: () => void;
  onNext?: () => void;
  onAspect?: (ar: number) => void;
  /** Buttons and anything else drawn over the picture. They do not start a press. */
  children?: JSX.Element;
}

/**
 * The studio's way of looking at a render: scroll or pinch to zoom (to 5x, toward the pointer),
 * drag to move once zoomed, double-click for 2.5x and back, swipe or the arrow keys for the next
 * render. Clicking does nothing. Press and hold shows the photo it was made from, opening from
 * the press point as a circle, and closing when let go.
 */
export function ZoomPane(props: ZoomPaneProps) {
  let box: HTMLDivElement | undefined;
  const [z, setZ] = createSignal(1);
  const [ox, setOx] = createSignal(0);
  const [oy, setOy] = createSignal(0);
  const [moving, setMoving] = createSignal(false);
  const [held, setHeld] = createSignal(false);
  const [at, setAt] = createSignal({ x: 0, y: 0 });
  const [maxR, setMaxR] = createSignal(2000);

  const pointers = new Map<number, { x: number; y: number }>();
  let start = { x: 0, y: 0, ox: 0, oy: 0 };
  let pinch = { d: 0, z: 1 };
  let moved = false;
  let holdTimer = 0;
  let swipeFrom: { x: number; y: number } | null = null;

  const rect = () => box!.getBoundingClientRect();

  /** Keep the picture covering the pane: no empty edge shows when zoomed. */
  const clamp = (x: number, y: number, zoom: number) => {
    const r = rect();
    const mx = ((zoom - 1) * r.width) / 2;
    const my = ((zoom - 1) * r.height) / 2;

    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) };
  };

  const zoomTo = (next: number, cx: number, cy: number) => {
    const r = rect();
    const nz = Math.max(1, Math.min(MAX_ZOOM, next));
    // The point under the pointer stays under it: offsets are from the pane's centre.
    const px = cx - r.left - r.width / 2;
    const py = cy - r.top - r.height / 2;
    const k = nz / z();
    const c = clamp(px - (px - ox()) * k, py - (py - oy()) * k, nz);

    setZ(nz);
    setOx(nz === 1 ? 0 : c.x);
    setOy(nz === 1 ? 0 : c.y);
  };

  const endHold = () => {
    clearTimeout(holdTimer);
    setHeld(false);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey) {
      // A trackpad pinch arrives as a wheel with ctrl held.
      zoomTo(z() * Math.exp(-e.deltaY * 0.012), e.clientX, e.clientY);

      return;
    }
    const notch = e.deltaMode === 1 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0);

    if (notch) {
      zoomTo(z() * (e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP), e.clientX, e.clientY);
    } else if (z() > 1) {
      const c = clamp(ox() - e.deltaX, oy() - e.deltaY, z());

      setOx(c.x);
      setOy(c.y);
    }
  };

  const onDown = (e: PointerEvent) => {
    if ((e.target as Element).closest("button, a, input")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    box!.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];

      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: z() };
      endHold();
      moved = true;
      swipeFrom = null;

      return;
    }

    moved = false;
    start = { x: e.clientX, y: e.clientY, ox: ox(), oy: oy() };
    swipeFrom = { x: e.clientX, y: e.clientY };
    const r = rect();

    setMaxR(Math.hypot(r.width, r.height));
    setAt({ x: e.clientX - r.left, y: e.clientY - r.top });
    clearTimeout(holdTimer);
    if (props.original) holdTimer = window.setTimeout(() => !moved && setHeld(true), HOLD_MS);
  };

  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);

      if (pinch.d > 0) zoomTo(pinch.z * (d / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);

      return;
    }

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;

    if (!moved && Math.hypot(dx, dy) > MOVE_PX) {
      moved = true;
      endHold();
    }
    if (moved && z() > 1) {
      const c = clamp(start.ox + dx, start.oy + dy, z());

      setMoving(true);
      setOx(c.x);
      setOy(c.y);
    }
  };

  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    endHold();
    setMoving(false);
    if (pointers.size > 0 || !swipeFrom) return;
    const dx = e.clientX - swipeFrom.x;
    const dy = e.clientY - swipeFrom.y;

    swipeFrom = null;
    if (z() === 1 && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) props.onNext?.();
      else props.onPrev?.();
    }
  };

  const onDouble = (e: MouseEvent) => {
    if ((e.target as Element).closest("button, a, input")) return;
    if (z() > 1) zoomTo(1, e.clientX, e.clientY);
    else zoomTo(DOUBLE_TAP_ZOOM, e.clientX, e.clientY);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;

    if (el && /^(input|textarea|select)$/i.test(el.tagName)) return;
    if (e.key === "ArrowRight") props.onNext?.();
    else if (e.key === "ArrowLeft") props.onPrev?.();
  };

  onMount(() => {
    box!.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    onCleanup(() => {
      box?.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      clearTimeout(holdTimer);
    });
  });

  return (
    <div
      ref={box}
      class={`xw-zp ${props.fit === "contain" ? "ct" : ""} ${z() > 1 ? "zoomed" : ""}`}
      title={props.original ? "Press and hold to see your photo" : undefined}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDblClick={onDouble}
      onContextMenu={(e) => props.original && e.preventDefault()}
    >
      <div
        class={`xw-zi ${moving() ? "mv" : ""}`}
        style={{ transform: `translate(${ox()}px, ${oy()}px) scale(${z()})` }}
      >
        <img
          class="xw-fg"
          src={props.src}
          alt=""
          draggable={false}
          onLoad={(e) => props.onAspect?.(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        />
      </div>

      <Show when={props.original}>
        <div
          class={`xw-orig ${held() ? "on" : ""}`}
          style={{ "clip-path": `circle(${held() ? maxR() : 0}px at ${at().x}px ${at().y}px)` }}
          aria-hidden="true"
        >
          <img src={props.original!} alt="" draggable={false} />
          <span class="xw-orig-chip">Your photo</span>
        </div>
      </Show>

      {props.children}
    </div>
  );
}
