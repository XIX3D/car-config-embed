import { createMemo, For, Show } from "solid-js";
import type { Catalogue, CatalogueEntry, Product, Variant } from "../../types";
import { IconCamera, IconCheck, IconSpark } from "./icons";

/** More wheels than this are never drawn at once: the visitor narrows by brand or by search. */
const SHOWN = 60;

interface PickerViewProps {
  phone: boolean;
  ar: number;
  previewUrl: string;
  catalogue: Catalogue;
  /** The brand shown, or null for every brand. */
  brandFilter: number | null;
  search: string;
  /** The wheel in play, with its finishes. Null until the visitor picks one. */
  product: Product | null;
  variants: Variant[];
  selectedVariantIds: string[];
  /** Finishes already rendered (or rendering) on this photo: shown, not offered again. */
  doneVariantIds: string[];
  onBrand: (id: number | null) => void;
  onSearch: (search: string) => void;
  onChoose: (entry: CatalogueEntry) => void;
  onToggleVariant: (id: string) => void;
  onRender: () => void;
  onChangePhoto: () => void;
}

const wheelImage = (p: Product) => p.reference_image_paths?.[0] || p.orthographic_image || "";
const variantImage = (v: Variant) => v.reference_image_paths?.[0] || v.reference_image || "";

/**
 * A dealer's code, photo in: the photo on the left, and on the right the dealer's brands and wheels
 * (the mock's dealer picker). Pick a brand, search, pick a wheel, pick its finishes, Render. A
 * dealer can carry hundreds of brands, so the list is always one brand or one search, never all.
 */
export function PickerView(props: PickerViewProps) {
  const done = (id: string) => props.doneVariantIds.includes(id);
  const picked = () => props.selectedVariantIds.filter((id) => !done(id)).length;
  const multi = () => props.variants.length > 1;

  const matches = createMemo(() => {
    const q = props.search.trim().toLowerCase();

    return props.catalogue.products
      .filter((e) => (props.brandFilter === null || Number(e.product.manufacturer_id) === props.brandFilter)
        && (!q || e.product.name.toLowerCase().includes(q)))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
  });

  const Photo = () => (
    <div class="xw-pic xw-sp-photo" style={{ "--ar": String(props.ar) }}>
      <img class="xw-fg" src={props.previewUrl} alt="" draggable={false} />
      <button class="xw-ib tr" aria-label="Use a different photo" onClick={() => props.onChangePhoto()}>
        <IconCamera />
      </button>
    </div>
  );

  return (
    <div class="xw-split">
      <div class="xw-sp-pic">
        <Photo />
      </div>

      <div class="xw-pk">
        <div class="xw-pk-top">
          <select
            class="xw-sel"
            aria-label="Brand"
            value={props.brandFilter === null ? "all" : String(props.brandFilter)}
            onChange={(e) => props.onBrand(e.currentTarget.value === "all" ? null : Number(e.currentTarget.value))}
          >
            <For each={props.catalogue.brands}>{(b) => <option value={String(b.id)}>{b.name}</option>}</For>
            <option value="all">All brands</option>
          </select>
          <input
            class="xw-in xw-pk-s"
            type="search"
            placeholder="Search wheels"
            aria-label="Search wheels"
            value={props.search}
            onInput={(e) => props.onSearch(e.currentTarget.value)}
          />
        </div>

        <div class="xw-pk-grid" role="listbox" aria-label="Wheels">
          <For each={matches().slice(0, SHOWN)}>
            {(e) => (
              <button
                type="button"
                role="option"
                aria-selected={props.product?.id === e.product.id}
                class={`xw-pk-tile ${props.product?.id === e.product.id ? "on" : ""}`}
                onClick={() => props.onChoose(e)}
              >
                <span class="xw-pk-img">
                  <Show when={wheelImage(e.product)}>
                    <img src={wheelImage(e.product)} alt="" loading="lazy" draggable={false} />
                  </Show>
                  <i class="xw-tk"><IconCheck /></i>
                </span>
                <b>{e.product.name}</b>
              </button>
            )}
          </For>
          <Show when={matches().length === 0}>
            <p class="xw-pk-none">No wheels found</p>
          </Show>
          <Show when={matches().length > SHOWN}>
            <p class="xw-pk-none">Search to see more</p>
          </Show>
        </div>

        <Show when={props.product}>
          <div class="xw-pk-fin">
            <Show when={multi()}>
              <span class="xw-pickl">Pick a finish</span>
            </Show>
            <div class="xw-pk-sws">
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
            </div>
          </div>
        </Show>

        <button type="button" class="xw-btn ai full" disabled={!props.product || picked() === 0} onClick={() => props.onRender()}>
          <IconSpark />
          Render
          <Show when={picked() > 1}>
            <span class="xw-chip">{picked()} renders</span>
          </Show>
        </button>
      </div>
    </div>
  );
}
