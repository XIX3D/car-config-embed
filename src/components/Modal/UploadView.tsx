import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Variant } from "../../types";
import { VALID_IMAGE_TYPES, MAX_FILE_SIZE_BYTES, MAX_IMAGE_DIMENSION } from "../../constants";
import { Frame } from "./Frame";
import { IconCamera, IconCheck, IconSpark, IconUpload } from "./icons";

interface UploadViewProps {
  phone: boolean;
  ar: number;
  variants: Variant[];
  selectedVariantIds: string[];
  /** Finishes already rendered (or rendering) on this photo: shown, not offered again. */
  doneVariantIds: string[];
  previewUrl: string | null;
  onFileSelect: (file: File) => void;
  onToggleVariant: (id: string) => void;
  onRender: () => void;
  onChangePhoto: () => void;
  /** A file the widget cannot use: "Can't use that photo". */
  onBadFile: () => void;
  onAspect: (ar: number) => void;
}

const variantImage = (v: Variant) => v.reference_image_paths?.[0] || v.reference_image || "";

/**
 * B2, "Upload a photo." (the studio's own screen), and once a photo is in, B3: the photo as big
 * as the render will be, the brand's one wheel and its finishes in the bar, Render at the right.
 */
export function UploadView(props: UploadViewProps) {
  const [drag, setDrag] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;

  const done = (id: string) => props.doneVariantIds.includes(id);
  const picked = () => props.selectedVariantIds.filter((id) => !done(id)).length;
  const multi = () => props.variants.length > 1;

  const handleFile = (file: File) => {
    // HEIC, anything over 20 MB or 8K: the same one screen the server's refusals land on.
    if (!VALID_IMAGE_TYPES.includes(file.type as (typeof VALID_IMAGE_TYPES)[number]) || file.size > MAX_FILE_SIZE_BYTES) {
      props.onBadFile();

      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth > MAX_IMAGE_DIMENSION || img.naturalHeight > MAX_IMAGE_DIMENSION) {
        props.onBadFile();

        return;
      }
      props.onAspect(img.naturalWidth / img.naturalHeight);
      props.onFileSelect(file);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      props.onBadFile();
    };
    img.src = url;
  };

  const handlePaste = (e: ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"));
    const file = item?.getAsFile();

    if (file) {
      e.preventDefault();
      handleFile(file);
    }
  };

  const Swatches = () => (
    <For each={props.variants}>
      {(v) => (
        <button
          type="button"
          class={`xw-sw ${multi() ? "" : "solo"} ${props.selectedVariantIds.includes(v.id) || done(v.id) ? "on" : ""} ${done(v.id) ? "done" : ""}`}
          disabled={!multi() || done(v.id)}
          aria-pressed={props.selectedVariantIds.includes(v.id)}
          onClick={() => props.onToggleVariant(v.id)}
        >
          <span class="xw-wc">
            <Show when={variantImage(v)}>
              <img src={variantImage(v)} alt="" />
            </Show>
            <i class="xw-tk"><IconCheck /></i>
          </span>
          <b>{v.variant_name}</b>
        </button>
      )}
    </For>
  );

  const RenderButton = () => (
    <button type="button" class="xw-btn ai" disabled={picked() === 0} onClick={() => props.onRender()}>
      <IconSpark />
      Render
      <Show when={picked() > 1}>
        <span class="xw-chip">{picked()} renders</span>
      </Show>
    </button>
  );

  // Paste works anywhere while this screen is up: nothing inside the window has focus to take it.
  onMount(() => {
    window.addEventListener("paste", handlePaste);
    onCleanup(() => window.removeEventListener("paste", handlePaste));
  });

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];

          e.currentTarget.value = "";
          if (file) handleFile(file);
        }}
      />
      <Show
        when={props.previewUrl}
        fallback={
          <div
            class={`xw-drop ${drag() ? "drag" : ""}`}
            role="button"
            aria-label="Upload a car photo"
            onClick={() => fileInputRef?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const file = e.dataTransfer?.files[0];

              if (file) handleFile(file);
            }}
          >
            <svg class="xw-dash" aria-hidden="true">
              <rect x="0" y="0" width="100%" height="100%" rx="22" />
            </svg>
            <div>
              <div class="xw-orb"><IconUpload /></div>
              <h2>Upload a photo.</h2>
            </div>
          </div>
        }
      >
        <Frame
          phone={props.phone}
          ar={props.ar}
          pic={
            <>
              <img class="xw-fg" src={props.previewUrl!} alt="" draggable={false} />
              <button class="xw-ib tr" aria-label="Use a different photo" onClick={() => props.onChangePhoto()}>
                <IconCamera />
              </button>
            </>
          }
          bar={
            <>
              <div class="xw-bcol">
                <Show when={multi()}>
                  <span class="xw-pickl">Pick a finish</span>
                </Show>
                <Swatches />
              </div>
              <RenderButton />
            </>
          }
          phoneUnder={
            <>
              <Show when={multi()}>
                <div class="xw-pickp">Pick a finish</div>
              </Show>
              <div class={`xw-sws ${multi() ? "" : "solo"}`}>
                <Swatches />
              </div>
            </>
          }
          phoneBar={<RenderButton />}
        />
      </Show>
    </div>
  );
}
