import {
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import type { RenderResult, DebugData } from "../../types";
import { ZENO, ZOOM, ZOOM_ENABLED } from "../../constants";
import { ModalHeader } from "./ModalHeader";
import { DebugPanel } from "../Debug/DebugPanel";

const DEBUG = import.meta.env.VITE_DEBUG === "true";

interface ResultViewProps {
  productImgUrl: string;
  brandName: string;
  modelName: string;
  results: RenderResult[];
  currentIndex: number;
  zoomLevel: number;
  panX: number;
  panY: number;
  interestedFinishes?: number[];
  onClose: () => void;
  onRetry: () => void;
  onFullscreen: () => void;
  onQuote: () => void;
  onSelectIndex: (index: number) => void;
  onZoom: (level: number) => void;
  onPan: (x: number, y: number) => void;
  onModalResize?: (width: number, height: number) => void;
  onToggleInterest?: (index: number) => void;
  onRerender?: (index: number) => void;
  rerenderingIndex?: number;
  triggerZoomAnimation?: boolean;
  debugData?: DebugData | null;
}

export function ResultView(props: ResultViewProps) {
  let imageRef: HTMLImageElement | undefined;
  let wrapperRef: HTMLDivElement | undefined;
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [lastTouchDist, setLastTouchDist] = createSignal(0);
  const [showZoomHint, setShowZoomHint] = createSignal(true);
  const [hasInteracted, setHasInteracted] = createSignal(false);
  const [isAnimatingZoom, setIsAnimatingZoom] = createSignal(false);
  const [objectPos, setObjectPos] = createSignal({ x: 50, y: 50 });
  const [posStart, setPosStart] = createSignal({ x: 50, y: 50 });
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches;

  const current = () => props.results[props.currentIndex];
  const isLiked = (index: number) =>
    props.interestedFinishes?.includes(index) ?? false;

  const getFilename = () => {
    const c = current();

    if (!c) return "my-wheel-build.jpg";
    const brand = props.brandName
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "");
    const model = props.modelName
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "");
    const finish = c.label.replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "");

    return `${brand}_${model}_${finish}_ZenoRender.jpg`;
  };

  const handleDownload = () => {
    const c = current();

    if (!c?.image) return;
    const link = document.createElement("a");

    link.href = c.image;
    link.download = getFilename();
    link.click();
  };

  const clampPan = (x: number, y: number): { x: number; y: number } => {
    if (props.zoomLevel <= 1 || !imageRef) return { x: 0, y: 0 };
    const maxPanX =
      (imageRef.offsetWidth * (props.zoomLevel - 1)) / (2 * props.zoomLevel);
    const maxPanY =
      (imageRef.offsetHeight * (props.zoomLevel - 1)) / (2 * props.zoomLevel);

    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, y)),
    };
  };

  const markInteracted = () => {
    if (!hasInteracted()) {
      setHasInteracted(true);
      setShowZoomHint(false);
    }
  };

  const handleWheel = (e: WheelEvent) => {
    if (!ZOOM_ENABLED) return;
    e.preventDefault();
    markInteracted();
    const delta = e.deltaY > 0 ? -ZOOM.step : ZOOM.step;
    const newZoom = Math.max(
      ZOOM.min,
      Math.min(ZOOM.max, props.zoomLevel + delta),
    );

    if (newZoom !== props.zoomLevel) {
      props.onZoom(newZoom);
      if (newZoom <= 1) {
        props.onPan(0, 0);
      } else {
        const clamped = clampPan(props.panX, props.panY);

        props.onPan(clamped.x, clamped.y);
      }
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ x: props.panX, y: props.panY });
    setPosStart({ x: objectPos().x, y: objectPos().y });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return;
    if (props.zoomLevel > 1) {
      const dx = (e.clientX - dragStart().x) / props.zoomLevel;
      const dy = (e.clientY - dragStart().y) / props.zoomLevel;
      const clamped = clampPan(panStart().x + dx, panStart().y + dy);

      props.onPan(clamped.x, clamped.y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      markInteracted();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );

      setLastTouchDist(dist);
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setPanStart({ x: props.panX, y: props.panY });
      setPosStart({ x: objectPos().x, y: objectPos().y });
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (ZOOM_ENABLED && e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const scale = dist / lastTouchDist();
      const newZoom = Math.max(
        ZOOM.min,
        Math.min(ZOOM.max, props.zoomLevel * scale),
      );

      props.onZoom(newZoom);
      setLastTouchDist(dist);
      const clamped = clampPan(props.panX, props.panY);

      props.onPan(clamped.x, clamped.y);
    } else if (e.touches.length === 1 && isDragging() && props.zoomLevel > 1) {
      e.preventDefault();
      const dx = (e.touches[0].clientX - dragStart().x) / props.zoomLevel;
      const dy = (e.touches[0].clientY - dragStart().y) / props.zoomLevel;
      const clamped = clampPan(panStart().x + dx, panStart().y + dy);

      props.onPan(clamped.x, clamped.y);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setLastTouchDist(0);
  };

  const resetZoom = (e: MouseEvent) => {
    e.stopPropagation();
    props.onZoom(1);
    props.onPan(0, 0);
  };

  const findNextValidIndex = (
    startIndex: number,
    direction: 1 | -1,
  ): number => {
    const len = props.results.length;
    let index = startIndex;

    for (let i = 0; i < len; i++) {
      index = (index + direction + len) % len;
      const result = props.results[index];

      if (result.success && !result.loading && result.image) {
        return index;
      }
    }

    return props.currentIndex;
  };

  const handlePrev = () => {
    const newIndex = findNextValidIndex(props.currentIndex, -1);

    props.onSelectIndex(newIndex);
  };

  const handleNext = () => {
    const newIndex = findNextValidIndex(props.currentIndex, 1);

    props.onSelectIndex(newIndex);
  };

  onMount(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  });

  onCleanup(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  });

  const handleImageLoad = () => {
    if (imageRef && props.onModalResize) {
      props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight);
    }
    setObjectPos({ x: 50, y: 50 });
  };

  createEffect(() => {
    void props.currentIndex;
    setObjectPos({ x: 50, y: 50 });
    setTimeout(() => {
      if (
        imageRef &&
        imageRef.complete &&
        imageRef.naturalWidth > 0 &&
        props.onModalResize
      ) {
        props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight);
      }
    }, 0);
  });

  createEffect(() => {
    if (!ZOOM_ENABLED) return;
    if (props.triggerZoomAnimation && !hasInteracted()) {
      setTimeout(() => {
        setIsAnimatingZoom(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            props.onZoom(1.5);
            setTimeout(() => {
              props.onZoom(1);
              setTimeout(() => {
                setIsAnimatingZoom(false);
                setShowZoomHint(false);
              }, 500);
            }, 500);
          });
        });
      }, 1000);
    }
  });

  const triggerDebugAnimation = () => {
    setIsAnimatingZoom(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        props.onZoom(1.5);
        setTimeout(() => {
          props.onZoom(1);
          setTimeout(() => {
            setIsAnimatingZoom(false);
          }, 500);
        }, 500);
      });
    });
  };

  const transformStyle = () => ({
    transform:
      props.zoomLevel > 1
        ? `scale(${props.zoomLevel}) translate(${props.panX}px, ${props.panY}px)`
        : undefined,
    "object-fit": "contain",
    "object-position":
      props.zoomLevel <= 1
        ? `${objectPos().x}% ${objectPos().y}%`
        : "center center",
    cursor:
      props.zoomLevel > 1 ? (isDragging() ? "grabbing" : "grab") : "default",
  });

  const handleClose = () => props.onClose();
  const handleRetry = () => props.onRetry();
  const handleFullscreen = () => props.onFullscreen();
  const handleQuote = () => props.onQuote();

  const canNavigate = () => props.results.length > 1;

  return (
    <div class="relative z-1 flex flex-col items-center pt-6 pb-4 px-6 min-h-[520px]">
      <ModalHeader
        brandName={props.brandName}
        modelName={props.modelName}
        productImgUrl={props.productImgUrl}
        onClose={handleClose}
        onBack={handleRetry}
      />

      {/* Result Content */}
      <div class="flex flex-col items-center w-full">
        <div
          ref={wrapperRef}
          class={`relative rounded-2xl overflow-hidden mb-4 animate-fadeInUp bg-black flex items-center justify-center ${isMobile ? "w-full" : "inline-block max-w-full"}`}
          style={{
            height: isMobile ? "min(calc(95svh - 380px), 400px)" : undefined,
            "touch-action": "none",
          }}
          onWheel={handleWheel}
        >
          {/* Image Actions Overlay - v13 layout */}
          {/* Top-left: Re-render button */}
          <Show when={props.onRerender}>
            <button
              class={`absolute top-2 sm:top-3 left-2 sm:left-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 ${
                props.rerenderingIndex === props.currentIndex
                  ? "cursor-wait opacity-80"
                  : "hover:scale-110 active:scale-95 cursor-pointer"
              }`}
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={(e) => {
                e.stopPropagation();
                if (props.rerenderingIndex !== props.currentIndex) {
                  props.onRerender?.(props.currentIndex);
                }
              }}
              disabled={props.rerenderingIndex === props.currentIndex}
              aria-label={
                props.rerenderingIndex === props.currentIndex
                  ? "Re-rendering..."
                  : "Re-render"
              }
            >
              <Show
                when={props.rerenderingIndex === props.currentIndex}
                fallback={
                  <svg
                    class="w-5 h-5 text-white/80"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M1 4v6h6M23 20v-6h-6" />
                    <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                  </svg>
                }
              >
                <svg
                  class="w-5 h-5 text-white/80 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="2"
                    opacity="0.3"
                  />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </Show>
            </button>
          </Show>

          {/* Top-right: Download button */}
          <button
            class="absolute top-2 sm:top-3 right-2 sm:right-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95 cursor-pointer"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            aria-label="Download"
          >
            <svg
              class="w-5 h-5 text-white/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>

          {/* Navigation arrows - center sides */}
          <Show when={canNavigate()}>
            <button
              class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:scale-110 hover:text-white hover:bg-black/50 active:scale-95 cursor-pointer"
              style={{ background: "rgba(0,0,0,0.3)" }}
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="Previous finish"
            >
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:scale-110 hover:text-white hover:bg-black/50 active:scale-95 cursor-pointer"
              style={{ background: "rgba(0,0,0,0.3)" }}
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              aria-label="Next finish"
            >
              <svg
                class="w-5 h-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </Show>

          {/* Bottom-right: Fullscreen button */}
          <button
            class="absolute bottom-3 sm:bottom-3 right-3 sm:right-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95 cursor-pointer"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => {
              e.stopPropagation();
              handleFullscreen();
            }}
            aria-label="Fullscreen"
          >
            <svg
              class="w-5 h-5 text-white/80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
            </svg>
          </button>

          {/* Reset zoom button */}
          <Show when={props.zoomLevel > ZOOM.resetThreshold}>
            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
              <button
                class="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 transition-colors hover:bg-black/80 cursor-pointer"
                onClick={resetZoom}
              >
                <svg
                  class="w-4 h-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                <span class="text-white text-sm font-medium">Reset Zoom</span>
              </button>
            </div>
          </Show>

          {/* Debug tools */}
          <Show when={DEBUG}>
            <button
              class="absolute bottom-3 left-3 z-20 bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-full text-white text-xs font-medium transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                triggerDebugAnimation();
              }}
            >
              Test Zoom
            </button>
            <Show when={props.debugData}>
              <DebugPanel debugData={props.debugData!} />
            </Show>
          </Show>

          {current()?.loading ? (
            <div class="avacar-result-img self-stretch flex items-center justify-center bg-black/20 rounded-2xl min-h-[300px]">
              <div class="flex flex-col items-center gap-2">
                <div class="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span class="text-white/50 text-sm">Rendering...</span>
              </div>
            </div>
          ) : !current()?.success ? (
            <div class="avacar-result-img self-stretch flex flex-col items-center justify-center bg-black/20 rounded-2xl min-h-[300px] gap-3">
              <span class="text-white/50 text-sm">Failed to render</span>
              <button
                class="px-4 py-2 rounded-xl bg-white/10 text-white/70 text-sm hover:bg-white/20 transition-colors cursor-pointer border-none"
                onClick={() => props.onRerender?.(props.currentIndex)}
              >
                Retry
              </button>
            </div>
          ) : (
            <div class="relative w-full h-full flex items-center justify-center">
              <img
                ref={imageRef}
                class={`avacar-result-img ${isAnimatingZoom() ? "zoom-animating" : ""}`}
                src={current()?.image || ""}
                alt="Preview"
                style={transformStyle()}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onLoad={handleImageLoad}
                draggable={false}
              />
              {props.rerenderingIndex === props.currentIndex && (
                <div class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
                  <div class="flex flex-col items-center gap-3">
                    <div class="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                    <span class="text-white/50 text-sm">Re-rendering...</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Finish name */}
        <p class="text-center text-white/60 text-[10px] sm:text-xs uppercase tracking-widest mb-2 sm:mb-3">
          {current()?.label}
        </p>

        {/* Color Carousel - v13 with interest indicators and re-render buttons */}
        <div class="w-full animate-fadeInUp opacity-0 [animation-delay:0.2s]">
          <div
            role="listbox"
            aria-label="Select finish"
            class="flex items-center justify-center gap-2.5 sm:gap-3 flex-wrap py-2 pb-3"
          >
            <For each={props.results}>
              {(result, i) => {
                const isSelected = () => i() === props.currentIndex;
                const isInterested = () => isLiked(i());
                const isRerendering = () => props.rerenderingIndex === i();

                return (
                  <div class="relative">
                    <button
                      role="option"
                      aria-selected={isSelected()}
                      aria-label={result.label}
                      tabIndex={isSelected() ? 0 : -1}
                      class={`flex-shrink-0 w-12 h-12 rounded-xl border-none transition-all relative focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none ${
                        result.loading || isRerendering()
                          ? "opacity-30 cursor-wait"
                          : result.success
                            ? "cursor-pointer"
                            : "opacity-20 cursor-not-allowed"
                      }`}
                      style={{
                        "background-image": result.referenceImage
                          ? `url(${result.referenceImage})`
                          : undefined,
                        "background-color": !result.referenceImage
                          ? result.hexColor || "#fff"
                          : undefined,
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "background-position": "center",
                        transform: isSelected() ? "scale(1.1)" : "scale(1)",
                        "box-shadow": isSelected()
                          ? "0 0 0 2px var(--theme-primary), 0 0 20px rgba(192,57,43,0.2)"
                          : "none",
                        opacity: isSelected()
                          ? 1
                          : isInterested()
                            ? 0.85
                            : 0.55,
                      }}
                      title={
                        result.loading
                          ? `${result.label} (loading...)`
                          : result.label
                      }
                      onClick={() => {
                        if (result.loading || isRerendering()) return;
                        if (!result.success) {
                          props.onRerender?.(i());

                          return;
                        }
                        props.onSelectIndex(i());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") {
                          e.preventDefault();
                          props.onSelectIndex(
                            Math.min(i() + 1, props.results.length - 1),
                          );
                        } else if (e.key === "ArrowLeft") {
                          e.preventDefault();
                          props.onSelectIndex(Math.max(i() - 1, 0));
                        }
                      }}
                      disabled={result.loading || isRerendering()}
                    >
                      {!result.loading &&
                        !result.success &&
                        !isRerendering() && (
                          <div class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                            <svg
                              class="w-5 h-5 text-white/80"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M1 4v6h6M23 20v-6h-6" />
                              <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                            </svg>
                          </div>
                        )}
                    </button>

                    <Show when={result.loading || isRerendering()}>
                      <div class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl pointer-events-none">
                        <div class="w-5 h-5 border-2 border-[var(--theme-primary)]/40 border-t-[var(--theme-primary)] rounded-full animate-spin" />
                      </div>
                    </Show>

                    {/* Interest indicator - heart in corner */}
                    <Show
                      when={isInterested() && !result.loading && result.success}
                    >
                      <div
                        class="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.6)" }}
                      >
                        <svg
                          class="w-3 h-3"
                          style={{ color: ZENO.heart }}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                        </svg>
                      </div>
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>

        {/* CTA Button - v13 style */}
        <div class="relative w-full max-w-80 animate-fadeInUp mt-2">
          <button
            class="relative w-full py-3.5 sm:py-4 rounded-2xl text-[1.2rem] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-zeno-electric text-white border-none hover:opacity-90 hover:scale-[1.01] active:scale-[0.98]"
            style={{ "box-shadow": "none" }}
            onClick={handleQuote}
          >
            <svg class="w-5 h-5" viewBox="0 0 36 36" fill="currentColor">
              <path d="M28.81 23.209c0-7.672-14.144-7.171-14.144-11.803c0-2.242 2.145-3.337 4.633-3.337c4.184 0 4.929 2.688 6.824 2.688c1.342 0 1.988-.845 1.988-1.792c0-2.201-3.337-3.867-6.537-4.444V2.397a2.398 2.398 0 1 0-4.798 0v2.199c-3.489.794-6.49 3.214-6.49 7.159c0 7.369 14.142 7.071 14.142 12.247c0 1.793-1.941 3.586-5.129 3.586c-4.781 0-6.374-3.236-8.316-3.236c-.946 0-1.792.796-1.792 1.996c0 1.906 3.195 4.2 7.588 4.841l-.003.015v2.397a2.401 2.401 0 0 0 4.8 0v-2.397c0-.028-.014-.05-.016-.075c3.953-.738 7.25-3.315 7.25-7.92z" />
            </svg>
            <span>
              {props.interestedFinishes && props.interestedFinishes.length > 0
                ? `Request Quote (${props.interestedFinishes.length})`
                : "Request Quote"}
            </span>
          </button>
        </div>
      </div>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center pt-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
