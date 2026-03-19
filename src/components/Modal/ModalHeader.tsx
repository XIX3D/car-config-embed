import { Show } from "solid-js";
import { TruncatedTitle } from "./TruncatedTitle";

interface ModalHeaderProps {
  brandName: string;
  modelName: string;
  productImgUrl?: string;
  onClose: () => void;
  onBack?: () => void;
}

export function ModalHeader(props: ModalHeaderProps) {
  const hasBack = () => !!props.onBack;

  const ProductInfo = () => (
    <div class="flex items-center gap-2.5 max-w-[280px] overflow-hidden">
      <div class="w-11 h-11 rounded-lg bg-white flex items-center justify-center overflow-hidden">
        <Show
          when={props.productImgUrl}
          fallback={
            <div class="w-full h-full rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
          }
        >
          <img
            class="w-full h-full rounded-full object-cover"
            src={props.productImgUrl}
            alt={props.modelName}
          />
        </Show>
      </div>
      <div class="flex flex-col flex-1 min-w-0 text-left">
        <span class="text-[9px] font-medium uppercase tracking-[1.5px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
          {props.brandName}
        </span>
        <TruncatedTitle
          text={props.modelName}
          class="text-base font-medium text-white"
        />
      </div>
    </div>
  );

  const CloseButton = () => (
    <button
      class="w-10 h-10 rounded-xl bg-transparent border-none text-white/30 text-2xl cursor-pointer flex items-center justify-center transition-all hover:text-white hover:bg-white/5 hover:scale-105 z-10"
      aria-label="Close"
      onClick={props.onClose}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );

  const BackButton = () => (
    <button
      class="w-10 h-10 rounded-xl flex items-center justify-center text-white/50 transition-all hover:text-white hover:bg-white/5 active:bg-white/10 active:scale-95"
      aria-label="Back"
      onClick={props.onBack}
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
  );

  return (
    <Show
      when={hasBack()}
      fallback={
        <div class="w-full relative mb-1 animate-fadeInUp">
          <div class="flex flex-1 justify-center items-center w-full">
            <ProductInfo />
          </div>
          <div class="absolute top-0 right-0">
            <CloseButton />
          </div>
        </div>
      }
    >
      <div class="flex items-center justify-between mb-4 w-full animate-fadeInUp">
        <div class="w-10 h-10">
          <BackButton />
        </div>
        <ProductInfo />
        <div class="w-10 h-10">
          <CloseButton />
        </div>
      </div>
    </Show>
  );
}
