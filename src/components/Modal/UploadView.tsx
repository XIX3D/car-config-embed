import { createSignal, For, Show } from "solid-js";
import type { Variant } from "../../types";
import {
  VALID_IMAGE_TYPES,
  MAX_FILE_SIZE_MB,
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
} from "../../constants";
import { ModalHeader } from "./ModalHeader";

interface UploadViewProps {
  productImgUrl: string;
  brandName: string;
  modelName: string;
  isWraps: boolean;
  variants: Variant[];
  selectedVariantIds: string[];
  previewUrl: string | null;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onToggleVariant: (id: string) => void;
  onContinue: () => void;
  onBackToInitial: () => void;
  onError: (message: string) => void;
}

const MAX_SELECTIONS = 3;

export function UploadView(props: UploadViewProps) {
  const [isDragover, setIsDragover] = createSignal(false);
  const [isPasting, setIsPasting] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  let fileInputRef: HTMLInputElement | undefined;
  let listboxRef: HTMLDivElement | undefined;

  const selectionIndex = (id: string) => props.selectedVariantIds.indexOf(id);
  const selectedCount = () => props.selectedVariantIds.length;
  const atLimit = () => selectedCount() >= MAX_SELECTIONS;
  const canContinue = () => !!props.previewUrl && selectedCount() > 0;

  const handleFile = (file: File) => {
    if (
      !VALID_IMAGE_TYPES.includes(
        file.type as (typeof VALID_IMAGE_TYPES)[number],
      )
    ) {
      props.onError(
        "Please upload a JPG, PNG, or WebP image. HEIC files are not supported.",
      );

      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(`Image must be under ${MAX_FILE_SIZE_MB}MB`);

      return;
    }

    setUploadError(null);

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      if (
        img.naturalWidth > MAX_IMAGE_DIMENSION ||
        img.naturalHeight > MAX_IMAGE_DIMENSION
      ) {
        setUploadError("Image must be under 8K");

        return;
      }
      props.onFileSelect(file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      props.onError("Could not read image file");
    };
    img.src = url;
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragover(false);
    if (e.dataTransfer?.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClose = () => props.onClose();
  const handleUploadClick = () => {
    fileInputRef?.click();
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragover(true);
  };
  const handleDragLeave = () => setIsDragover(false);

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;

    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();

        if (file) {
          setIsPasting(true);
          setTimeout(() => setIsPasting(false), 300);
          handleFile(file);

          return;
        }
      }
    }

    if (e.clipboardData?.types.length) {
      props.onError("Please paste an image file (JPG, PNG, or WebP)");
    }
  };

  const handleVariantKeyDown = (e: KeyboardEvent, i: number, id: string) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (!listboxRef) return;
      const buttons = listboxRef.querySelectorAll<HTMLButtonElement>(
        '[data-variant-swatch="true"]',
      );
      const targetIndex =
        e.key === "ArrowRight"
          ? Math.min(i + 1, buttons.length - 1)
          : Math.max(i - 1, 0);

      buttons[targetIndex]?.focus();
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      props.onToggleVariant(id);
    }
  };

  const handleContinue = () => {
    if (!canContinue()) return;
    props.onContinue();
  };

  return (
    <div
      class="relative z-1 p-6 flex flex-col gap-6 items-center text-center min-h-[520px]"
      tabindex="0"
      onPaste={handlePaste}
    >
      <ModalHeader
        brandName={props.brandName}
        modelName={props.modelName}
        productImgUrl={props.productImgUrl}
        onClose={handleClose}
        onBack={props.previewUrl ? props.onBackToInitial : undefined}
      />

      <h2 class="text-2xl sm:text-4xl font-medium text-white animate-fadeInUp whitespace-nowrap">
        See it on Your Car
      </h2>

      {/* Upload Box */}
      <div
        class={`avacar-upload-box ${isDragover() || isPasting() ? "dragover" : ""} ${props.previewUrl ? "has-file" : ""}`}
        onClick={handleUploadClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <svg class="avacar-upload-border" preserveAspectRatio="none">
          <defs>
            <linearGradient
              id="dashGradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop
                offset="0%"
                style="stop-color: var(--dash-color-light)"
                stop-opacity="0.5"
              />
              <stop
                offset="50%"
                style="stop-color: var(--dash-color-muted)"
                stop-opacity="0.5"
              />
              <stop
                offset="100%"
                style="stop-color: var(--dash-color-light)"
                stop-opacity="0.5"
              />
            </linearGradient>
          </defs>
          <rect
            x="10"
            y="10"
            width="calc(100% - 20px)"
            height="calc(100% - 20px)"
            rx="12"
            ry="12"
            fill="none"
            stroke="url(#dashGradient)"
            stroke-width="2"
            stroke-dasharray="10 6"
            stroke-linecap="round"
          />
        </svg>
        <div class="avacar-upload-shimmer" />
        <div class="relative z-2 flex flex-col items-center w-full">
          {props.previewUrl ? (
            <img
              class="max-w-full max-h-[50vh] sm:max-h-[65vh] w-auto h-auto object-contain rounded-xl block"
              src={props.previewUrl}
              alt="Preview"
              draggable={false}
            />
          ) : (
            <>
              <svg
                class="w-12 h-9 mb-4"
                viewBox="0 0 100 74"
                fill="currentColor"
              >
                <path d="M97.2561 0H2.03685C0.9119 0 0 0.912103 0 2.03685V71.4789C0 72.6037 0.9119 73.5158 2.03685 73.5158H97.2561C98.3809 73.5158 99.293 72.6037 99.293 71.4789V2.03685C99.293 0.912103 98.3811 0 97.2561 0ZM95.2193 4.07371V51.9878L74.0323 35.6788C73.3471 35.151 72.4036 35.1139 71.6787 35.5857L57.7674 44.6407L30.3218 25.8167C29.6717 25.3708 28.8223 25.3401 28.1412 25.7385L4.07371 39.8205V4.07371H95.2193Z" />
              </svg>
              <p class="text-lg font-medium text-white m-0 mb-1">
                Drop your car photo
              </p>
              <p class="text-sm text-white/40 m-0">or tap / paste to upload</p>
              <Show when={uploadError()}>
                <p class="text-xs mt-2 m-0" style={{ color: "#ff6b6b" }}>
                  {uploadError()}
                </p>
              </Show>
            </>
          )}
        </div>
        <Show when={props.previewUrl}>
          <div class="avacar-upload-chip" aria-hidden="true">
            <svg viewBox="0 0 100 74" fill="currentColor">
              <path d="M97.2561 0H2.03685C0.9119 0 0 0.912103 0 2.03685V71.4789C0 72.6037 0.9119 73.5158 2.03685 73.5158H97.2561C98.3809 73.5158 99.293 72.6037 99.293 71.4789V2.03685C99.293 0.912103 98.3811 0 97.2561 0ZM95.2193 4.07371V51.9878L74.0323 35.6788C73.3471 35.151 72.4036 35.1139 71.6787 35.5857L57.7674 44.6407L30.3218 25.8167C29.6717 25.3708 28.8223 25.3401 28.1412 25.7385L4.07371 39.8205V4.07371H95.2193Z" />
            </svg>
            <span>Change</span>
          </div>
          <div class="avacar-upload-overlay">
            <svg viewBox="0 0 100 74" fill="currentColor">
              <path d="M97.2561 0H2.03685C0.9119 0 0 0.912103 0 2.03685V71.4789C0 72.6037 0.9119 73.5158 2.03685 73.5158H97.2561C98.3809 73.5158 99.293 72.6037 99.293 71.4789V2.03685C99.293 0.912103 98.3811 0 97.2561 0ZM95.2193 4.07371V51.9878L74.0323 35.6788C73.3471 35.151 72.4036 35.1139 71.6787 35.5857L57.7674 44.6407L30.3218 25.8167C29.6717 25.3708 28.8223 25.3401 28.1412 25.7385L4.07371 39.8205V4.07371H95.2193Z" />
            </svg>
            <p class="avacar-upload-overlay__title">Drop your car photo</p>
            <p class="avacar-upload-overlay__hint">or tap / paste to upload</p>
          </div>
        </Show>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];

          if (file) handleFile(file);
        }}
      />

      <Show when={props.previewUrl && props.variants.length > 0}>
        <div class="flex flex-col items-center gap-3 w-full animate-fadeInUp opacity-0 [animation-delay:0.1s]">
          <div class="flex flex-col items-center gap-1" aria-live="polite">
            <p class="text-sm text-white/70 m-0 font-medium">Select a finish</p>
            <Show when={selectedCount()}>
              <p class="text-xs text-white/50 m-0">
                {selectedCount()} selected
              </p>
            </Show>
          </div>

          <div
            ref={listboxRef}
            role="listbox"
            aria-multiselectable="true"
            aria-label="Select finishes"
            class="flex items-center justify-center gap-2.5 sm:gap-3 flex-wrap py-2 max-h-[30vh] overflow-y-auto scrollbar-hide w-full"
          >
            <For each={props.variants}>
              {(variant, i) => {
                const isSelected = () => selectionIndex(variant.id) !== -1;
                const orderNumber = () => selectionIndex(variant.id) + 1;
                const refImg = () =>
                  variant.reference_image_paths?.[0] ||
                  variant.reference_image ||
                  null;

                return (
                  <div class="relative">
                    <button
                      type="button"
                      data-variant-swatch="true"
                      role="option"
                      aria-selected={isSelected()}
                      aria-label={
                        isSelected()
                          ? `${variant.variant_name}, selection ${orderNumber()} of ${MAX_SELECTIONS}`
                          : variant.variant_name
                      }
                      tabIndex={i() === 0 ? 0 : -1}
                      title={variant.variant_name}
                      class="flex-shrink-0 w-12 h-12 rounded-xl border-none transition-all relative cursor-pointer focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none hover:opacity-100"
                      style={{
                        "background-image": refImg()
                          ? `url(${refImg()})`
                          : undefined,
                        "background-color": !refImg()
                          ? variant.hex_color || "#fff"
                          : undefined,
                        "background-size": "contain",
                        "background-repeat": "no-repeat",
                        "background-position": "center",
                        transform: isSelected() ? "scale(1.1)" : "scale(1)",
                        "box-shadow": isSelected()
                          ? "0 0 0 2px var(--theme-primary), 0 0 20px rgba(192,57,43,0.2)"
                          : "none",
                        opacity: isSelected() ? 1 : 0.55,
                      }}
                      onClick={() => props.onToggleVariant(variant.id)}
                      onKeyDown={(e) =>
                        handleVariantKeyDown(e, i(), variant.id)
                      }
                    />
                  </div>
                );
              }}
            </For>
          </div>

          <div class="relative w-full max-w-80 mt-1">
            <button
              type="button"
              disabled={!canContinue()}
              class="relative w-full py-3.5 sm:py-4 rounded-2xl text-[1.2rem] font-medium flex items-center justify-center transition-all bg-zeno-electric text-white border-none hover:opacity-90 hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ "box-shadow": "none" }}
              onClick={handleContinue}
            >
              <span>See it on my car</span>
            </button>
          </div>
        </div>
      </Show>

      {/* Disclaimer */}
      <p class="text-[10px] text-white/50 text-center px-4 mt-4">
        *Renderings are intended as a guide only and are not an exact
        representation of the wheel style, fitment, finish or vehicle.
      </p>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center pt-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
