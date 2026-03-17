import {
  createSignal,
  createEffect,
  For,
  Show,
  onMount,
  onCleanup,
} from "solid-js";
import type { RenderResult } from "../../types";
import { ZENO, ZOOM } from "../../constants";
import { TruncatedTitle } from "./TruncatedTitle";

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
  onDownloadMenu?: () => void;
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
    const finish = c.label
      .replace(" (Original)", "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/gi, "");
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
    if (props.zoomLevel <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setPanStart({ x: props.panX, y: props.panY });
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging()) return;
    const dx = (e.clientX - dragStart().x) / props.zoomLevel;
    const dy = (e.clientY - dragStart().y) / props.zoomLevel;
    const clamped = clampPan(panStart().x + dx, panStart().y + dy);
    props.onPan(clamped.x, clamped.y);
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
    } else if (e.touches.length === 1 && props.zoomLevel > 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setPanStart({ x: props.panX, y: props.panY });
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2) {
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
    } else if (e.touches.length === 1 && isDragging()) {
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

  const findNextValidIndex = (startIndex: number, direction: 1 | -1): number => {
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

  const handleLike = () => {
    props.onToggleInterest?.(props.currentIndex);
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
  };

  createEffect(() => {
    void props.currentIndex;
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

  const transformStyle = () => ({
    transform: `scale(${props.zoomLevel}) translate(${props.panX}px, ${props.panY}px)`,
    cursor:
      props.zoomLevel > 1 ? (isDragging() ? "grabbing" : "grab") : "default",
  });

  const handleClose = () => props.onClose();
  const handleRetry = () => props.onRetry();
  const handleFullscreen = () => props.onFullscreen();
  const handleQuote = () => props.onQuote();

  const canNavigate = () => props.results.length > 1;

  return (
    <div class="relative z-1 flex flex-col items-center p-6 min-h-[520px]">
      {/* Header - v13 centered layout */}
      <div class="flex items-center justify-between mb-4 w-full animate-fadeInUp">
        {/* Left: Back/Restart button */}
        <div class="w-10 h-10">
          <button
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white/50 transition-all hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-95"
            aria-label="New photo"
            onClick={handleRetry}
          >
            <svg
              class="w-5 h-5"
              viewBox="0 0 17 13"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15.8526 6.34375H0.75M0.75 6.34375L6.34084 11.9346M0.75 6.34375L6.34084 0.752911" />
            </svg>
          </button>
        </div>

        {/* Center: Brand & Model */}
        <div class="text-left">
          <p
            class="text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase"
            style={{ color: ZENO.electric }}
          >
            {props.brandName}
          </p>
          <TruncatedTitle
            text={props.modelName}
            class="text-base sm:text-lg font-medium text-white"
          />
        </div>

        {/* Right: Close button */}
        <div class="w-10 h-10">
          <button
            class="w-10 h-10 rounded-xl flex items-center justify-center text-white/30 transition-all hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-95"
            aria-label="Close"
            onClick={handleClose}
          >
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Result Content */}
      <div class="flex flex-col items-center w-full">
        <div
          ref={wrapperRef}
          class="relative inline-block rounded-2xl overflow-hidden mb-4 max-w-full animate-fadeInUp"
          onWheel={handleWheel}
        >
          {/* Image Actions Overlay - v13 layout */}
          {/* Top-left: Like button */}
          <Show when={props.onToggleInterest}>
            <button
              class="absolute top-2 sm:top-3 left-2 sm:left-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95"
              style={{ background: "rgba(0,0,0,0.4)" }}
              onClick={(e) => {
                e.stopPropagation();
                handleLike();
              }}
              aria-label={
                isLiked(props.currentIndex)
                  ? "Remove from quote"
                  : "Add to quote"
              }
            >
              {isLiked(props.currentIndex) ? (
                <svg
                  class="w-5 h-5"
                  style={{ color: ZENO.heart }}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
              ) : (
                <svg
                  class="w-5 h-5 text-white/80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              )}
            </button>
          </Show>

          {/* Top-right: Download button */}
          <button
            class="absolute top-2 sm:top-3 right-2 sm:right-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95"
            style={{ background: "rgba(0,0,0,0.4)" }}
            onClick={(e) => {
              e.stopPropagation();
              if (props.onDownloadMenu) {
                props.onDownloadMenu();
              } else {
                handleDownload();
              }
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
              class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:scale-110 hover:text-white hover:bg-black/50 active:scale-95"
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
              class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center text-white/70 transition-all z-10 hover:scale-110 hover:text-white hover:bg-black/50 active:scale-95"
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
            class="absolute bottom-2 sm:bottom-3 right-2 sm:right-3 w-9 h-9 sm:w-10 sm:h-10 rounded-full backdrop-blur-sm flex items-center justify-center transition-all z-10 hover:scale-110 active:scale-95"
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

          {/* Zoom hint */}
          <Show when={showZoomHint() && !hasInteracted()}>
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
              <div class="bg-black/70 backdrop-blur-sm px-4 py-2.5 rounded-full flex items-center gap-2">
                <svg
                  class="w-5 h-5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                  <path d="M11 8v6M8 11h6" />
                </svg>
                <span class="text-white text-xs sm:text-sm font-medium">
                  Scroll to zoom
                </span>
              </div>
            </div>
          </Show>

          {/* Reset zoom button */}
          <Show when={props.zoomLevel > ZOOM.resetThreshold}>
            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
              <button
                class="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-full flex items-center gap-2 transition-colors hover:bg-black/80"
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

          {current()?.loading ? (
            <div class="avacar-result-img flex items-center justify-center bg-black/20 rounded-2xl min-h-[300px]">
              <div class="flex flex-col items-center gap-3">
                <div class="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                <span class="text-white/50 text-sm">Rendering...</span>
              </div>
            </div>
          ) : (
            <img
              ref={imageRef}
              class="avacar-result-img"
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
          )}
        </div>

        {/* Finish name */}
        <p class="text-center text-white/50 text-[10px] sm:text-xs uppercase tracking-widest mb-2 sm:mb-3">
          {current()?.label.replace(" (Original)", "")}
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
                          ? "0 0 0 2px #fff, 0 0 20px rgba(255,255,255,0.2)"
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
                      onClick={() =>
                        result.success &&
                        !result.loading &&
                        !isRerendering() &&
                        props.onSelectIndex(i())
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          props.onSelectIndex(Math.min(i() + 1, props.results.length - 1));
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          props.onSelectIndex(Math.max(i() - 1, 0));
                        }
                      }}
                      disabled={
                        result.loading || !result.success || isRerendering()
                      }
                    >
                      {(result.loading || isRerendering()) && (
                        <div class="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                          <div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                      {!result.loading &&
                        !isRerendering() &&
                        !result.success && (
                          <div class="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
                            <svg
                              class="w-5 h-5 text-red-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                            >
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </div>
                        )}
                    </button>

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

                    {/* Re-render button - shows on hover (desktop) or tap (mobile) */}
                    <Show
                      when={
                        props.onRerender &&
                        result.success &&
                        !result.loading &&
                        !isRerendering()
                      }
                    >
                      <button
                        class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90"
                        style={{
                          background: ZENO.electric,
                          opacity: isSelected() ? 1 : 0.7,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onRerender?.(i());
                        }}
                        title="Re-render this finish"
                      >
                        <svg
                          class="w-3 h-3 text-white"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <path d="M1 4v6h6M23 20v-6h-6" />
                          <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                        </svg>
                      </button>
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
            class="relative w-full py-3.5 sm:py-4 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-white text-zeno-card border-none hover:bg-gray-100 hover:scale-[1.01] active:scale-[0.98]"
            style={{ "box-shadow": "none" }}
            onClick={handleQuote}
          >
            <svg
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
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
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
