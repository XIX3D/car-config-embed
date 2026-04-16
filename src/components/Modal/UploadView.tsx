import { createSignal, Show } from "solid-js";
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
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onError: (message: string) => void;
}

export function UploadView(props: UploadViewProps) {
  const [isDragover, setIsDragover] = createSignal(false);
  const [isPasting, setIsPasting] = createSignal(false);
  const [uploadError, setUploadError] = createSignal<string | null>(null);
  const [previewUrl, setPreviewUrl] = createSignal<string | null>(null);
  const [objectPos, setObjectPos] = createSignal({ x: 50, y: 50 });
  const [isPanning, setIsPanning] = createSignal(false);
  const [panStart, setPanStart] = createSignal({ x: 0, y: 0 });
  const [posStart, setPosStart] = createSignal({ x: 50, y: 50 });
  let fileInputRef: HTMLInputElement | undefined;
  let previewRef: HTMLImageElement | undefined;

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
      if (img.naturalWidth > MAX_IMAGE_DIMENSION || img.naturalHeight > MAX_IMAGE_DIMENSION) {
        setUploadError("Image must be under 8K");
        return;
      }
      setPreviewUrl(URL.createObjectURL(file));
      setTimeout(() => props.onFileSelect(file), 300);
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
    if (!previewUrl()) fileInputRef?.click();
  };

  const handlePreviewMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
    setPosStart({ x: objectPos().x, y: objectPos().y });
  };

  const handlePreviewMouseMove = (e: MouseEvent) => {
    if (!isPanning()) return;
    const dx = (e.clientX - panStart().x) * 0.5;
    const dy = (e.clientY - panStart().y) * 0.5;
    const newX = Math.max(0, Math.min(100, posStart().x - dx));
    const newY = Math.max(0, Math.min(100, posStart().y - dy));
    setObjectPos({ x: newX, y: newY });
  };

  const handlePreviewMouseUp = () => setIsPanning(false);

  const handlePreviewTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.stopPropagation();
    setIsPanning(true);
    setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    setPosStart({ x: objectPos().x, y: objectPos().y });
  };

  const handlePreviewTouchMove = (e: TouchEvent) => {
    if (!isPanning() || e.touches.length !== 1) return;
    e.preventDefault();
    const dx = (e.touches[0].clientX - panStart().x) * 0.5;
    const dy = (e.touches[0].clientY - panStart().y) * 0.5;
    const newX = Math.max(0, Math.min(100, posStart().x - dx));
    const newY = Math.max(0, Math.min(100, posStart().y - dy));
    setObjectPos({ x: newX, y: newY });
  };

  const handlePreviewTouchEnd = () => setIsPanning(false);
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
      class="relative z-1 p-6 flex flex-col gap-6 items-center text-center min-h-[520px]"
      tabindex="0"
      onPaste={handlePaste}
    >
      <ModalHeader
        brandName={props.brandName}
        modelName={props.modelName}
        productImgUrl={props.productImgUrl}
        onClose={handleClose}
      />

      <h2 class="text-2xl sm:text-4xl font-medium text-white animate-fadeInUp whitespace-nowrap">
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
        <div class="relative z-2 flex flex-col items-center">
          {previewUrl() ? (
            <img
              ref={previewRef}
              class="w-full max-h-[200px] object-cover rounded-xl cursor-grab active:cursor-grabbing"
              style={{
                "object-position": `${objectPos().x}% ${objectPos().y}%`,
              }}
              src={previewUrl() || ""}
              alt="Preview"
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={handlePreviewMouseUp}
              onTouchStart={handlePreviewTouchStart}
              onTouchMove={handlePreviewTouchMove}
              onTouchEnd={handlePreviewTouchEnd}
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
      <div class="text-white/40 text-xs text-center pt-4 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">Zeno</strong>
      </div>
    </div>
  );
}
