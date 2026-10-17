import { For, Show, createEffect } from "solid-js";
import type { LoadingStep } from "../../types";
import { ModalHeader } from "./ModalHeader";

interface LoadingViewProps {
  productImgUrl: string;
  brandName: string;
  modelName: string;
  previewDataUrl: string | null;
  loadingSteps: LoadingStep[];
  currentStep: number;
  onClose: () => void;
  onModalResize?: (width: number, height: number) => void;
}

function createLoadingText(text: string) {
  return text.split("").map((char, i) => ({
    char: char === " " ? "\u00A0" : char,
    delay: i * 0.1,
  }));
}

export function LoadingView(props: LoadingViewProps) {
  let imageRef: HTMLImageElement | undefined;
  const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const loadingLetters = () =>
    createLoadingText(props.loadingSteps[props.currentStep]?.text || "");
  const isLongWait = () => props.currentStep >= props.loadingSteps.length - 2;

  const handleClose = () => props.onClose();

  const handleImageLoad = () => {
    if (imageRef && props.onModalResize) {
      props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight);
    }
  };

  createEffect(() => {
    if (
      props.previewDataUrl &&
      imageRef &&
      imageRef.complete &&
      imageRef.naturalWidth > 0 &&
      props.onModalResize
    ) {
      props.onModalResize(imageRef.naturalWidth, imageRef.naturalHeight);
    }
  });

  return (
    <div class="relative z-1 p-6 flex flex-col gap-6 items-center text-center min-h-[min(520px,90vh)] overflow-y-auto [scrollbar-width:thin]">
      <ModalHeader
        brandName={props.brandName}
        modelName={props.modelName}
        productImgUrl={props.productImgUrl}
        onClose={handleClose}
      />

      <h2 class="text-2xl sm:text-4xl font-medium text-white animate-fadeInUp whitespace-nowrap">
        See it on Your Car
      </h2>

      {/* Image Container with Generating State */}
      <div
        class={`relative shrink-0 rounded-2xl overflow-hidden mb-4 animate-fadeInUp bg-black ${isMobile ? "w-full" : "inline-block max-w-full"}`}
        style={{ height: isMobile ? "min(max(calc(95svh - 380px), 180px), 400px)" : undefined }}
      >
        <Show when={props.previewDataUrl}>
          <img
            ref={imageRef}
            src={props.previewDataUrl!}
            alt="Processing"
            class="avacar-result-img generating-image"
            // On a phone the box has a fixed height, so `cover` cut a wide photo down to under
            // half of it. Show the whole photo, letterboxed on black, as the result view does.
            style={{ "object-fit": "contain" }}
            onLoad={handleImageLoad}
            draggable={false}
          />
        </Show>

        {/* Inner glow effect */}
        <div class="avacar-inner-glow" />

        {/* Generating overlay */}
        <div class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.25)_70%)]">
          <div class="flex justify-center">
            <For each={loadingLetters()}>
              {(letter) => (
                <span
                  class="avacar-loading-letter"
                  style={{ "animation-delay": `${letter.delay}s` }}
                >
                  {letter.char}
                </span>
              )}
            </For>
          </div>
        </div>
      </div>

      {/* Dynamic message */}
      <p class="mt-4 text-sm text-white/40 animate-pulse">
        {isLongWait() ? "This may take a moment..." : "~30 seconds"}
      </p>


      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">XIX3D</strong>
      </div>
    </div>
  );
}
