import { createSignal } from "solid-js";
import { ZENO, VALID_IMAGE_TYPES } from "../../constants";
import { TruncatedTitle } from "./TruncatedTitle";

interface UploadViewProps {
  productImgUrl: string;
  brandName: string;
  modelName: string;
  isWraps: boolean;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onError: (message: string) => void;
}

export function UploadView(props: UploadViewProps) {
  const [isDragover, setIsDragover] = createSignal(false);
  const [isPasting, setIsPasting] = createSignal(false);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  let fileInputRef: HTMLInputElement | undefined;

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

    const reader = new FileReader();

    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
      setTimeout(() => props.onFileSelect(file), 300);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragover(false);
    if (e.dataTransfer?.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleClose = () => props.onClose();
  const handleUploadClick = () => fileInputRef?.click();
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

  return (
    <div
      class="relative z-1 p-6 flex flex-col items-center text-center min-h-[520px]"
      tabindex="0"
      onPaste={handlePaste}
    >
      {/* Header */}
      <div class="flex items-center justify-between mb-1 w-full animate-fadeInUp">
        <div class="flex items-center gap-3 mx-auto">
          <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {props.productImgUrl ? (
              <img
                class="w-11 h-11 rounded-full object-cover"
                src={props.productImgUrl}
                alt={props.modelName}
              />
            ) : (
              <div class="w-11 h-11 rounded-full bg-gradient-to-br from-gray-400 to-gray-500" />
            )}
          </div>
          <div class="flex flex-col">
            <span class="text-[10px] font-medium uppercase tracking-[2px] bg-gradient-to-r from-zeno-cyan to-zeno-green bg-clip-text text-transparent">
              {props.brandName}
            </span>
            <TruncatedTitle
              text={props.modelName}
              class="text-xl font-semibold text-white"
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

      <h2 class="text-2xl font-semibold m-0 mb-6 text-white animate-fadeInUp">
        See it on Your Car
      </h2>

      {/* Upload Box */}
      <div
        class={`avacar-upload-box ${isDragover() || isPasting() ? "dragover" : ""} ${previewUrl() ? "has-file" : ""}`}
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
              <stop offset="0%" stop-color={ZENO.cyan} stop-opacity="0.5" />
              <stop offset="50%" stop-color={ZENO.green} stop-opacity="0.5" />
              <stop offset="100%" stop-color={ZENO.cyan} stop-opacity="0.5" />
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
        <div class="relative z-2 flex flex-col items-center">
          {previewUrl() ? (
            <img
              class="w-full max-h-[200px] object-contain rounded-xl"
              src={previewUrl() || ""}
              alt="Preview"
            />
          ) : (
            <>
              <div class="w-16 h-16 rounded-full bg-white/[0.08] flex items-center justify-center mb-4 transition-all group-hover:bg-white/[0.12] group-hover:scale-110">
                <svg
                  class="w-7 h-7 text-white/70 transition-colors group-hover:text-white/90"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p class="text-lg font-medium text-white m-0 mb-1">
                Drop your car photo
              </p>
              <p class="text-sm text-white/40 m-0">or tap / paste to upload</p>
            </>
          )}
        </div>
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

      {/* Disclaimer */}
      <p class="text-[10px] text-white/50 text-center px-4 mt-4">
        *Renderings are intended as a guide only and are not an exact
        representation of the wheel style, fitment, finish or vehicle.
      </p>

      {/* Footer */}
      <div class="text-white/40 text-xs text-center py-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
