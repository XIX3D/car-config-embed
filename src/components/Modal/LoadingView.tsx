import { For, Show, createEffect } from "solid-js";
import type { LoadingStep } from "../../types";
import { TruncatedTitle } from "./TruncatedTitle";
import { AmbientParticles } from "./AmbientParticles";

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
    <div class="relative z-1 p-6 flex flex-col items-center text-center min-h-[520px]">
      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            <Show
              when={props.productImgUrl}
              fallback={
                <div class="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
              }
            >
              <img
                class="w-11 h-11 rounded-full object-cover"
                src={props.productImgUrl}
                alt={props.modelName}
              />
            </Show>
          </div>
          <div class="flex flex-col text-left">
            <span class="text-[10px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle
              text={props.modelName}
              class="text-xl font-medium text-white"
            />
          </div>
        </div>
        <button
          class="w-10 h-10 rounded-xl bg-transparent border-none text-white/30 text-2xl cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/5 hover:scale-105 z-10"
          aria-label="Close"
          onClick={handleClose}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <h2 class="text-2xl font-medium mt-5 mb-6 text-white animate-fadeInUp">
        See it on Your Car
      </h2>

      {/* Image Container with Generating State */}
      <div class="relative inline-block rounded-2xl overflow-hidden mb-4 max-w-full animate-fadeInUp">
        <Show when={props.previewDataUrl}>
          <img
            ref={imageRef}
            src={props.previewDataUrl!}
            alt="Processing"
            class="avacar-result-img generating-image"
            onLoad={handleImageLoad}
            draggable={false}
          />
        </Show>

        {/* Ambient Particles on the image */}
        <div class="absolute inset-0 pointer-events-none overflow-hidden">
          <AmbientParticles count={8} />
        </div>

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

      {/* Progress indicator */}
      <div class="flex gap-1.5 mt-3">
        <For each={props.loadingSteps}>
          {(_, i) => (
            <div
              class={`w-2 h-2 rounded-full transition-all duration-300 ${
                i() < props.currentStep
                  ? "bg-zeno-cyan"
                  : i() === props.currentStep
                    ? "bg-zeno-electric animate-pulse"
                    : "bg-white/20"
              }`}
            />
          )}
        </For>
      </div>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
