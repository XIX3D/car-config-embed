import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Catalogue, CatalogueEntry, Product, Variant } from "../../types";
import type { Pick } from "../../stores/widget-store";
import { brandLogo } from "../../utils/brandLogos";
import { carName, loadSeenOn, seenOn, type Car } from "../../utils/seenOn";
import { MetalButton } from "../MetalButton";
import { IconCheck, IconSwap } from "./icons";

/** More wheels than this are never drawn at once: the visitor narrows by brand or by search. */
const SHOWN = 90;
/** The strip of suggestions shows this many; "See all" shows every one. */
const STRIP = 12;

interface PickerViewProps {
  phone: boolean;
  ar: number;
  previewUrl: string;
  catalogue: Catalogue;
  /** The dealer's list is still on its way: placeholders stand in. */
  loading: boolean;
  /** The brand shown, or null before the list arrives. */
  brandFilter: number | null;
  search: string;
  /** Every wheel picked so far, with its finishes. */
  picks: Pick[];
  /** The wheel the page picked for the visitor, until they touch the selection. */
  autoPick: string | null;
  /** A new photo picks the first wheel on screen, once (or none, when the list has none). */
  onAutoPick: (entry: CatalogueEntry | null) => void;
  /** Finishes already rendered (or rendering) on this photo, by wheel: shown, not offered again. */
  doneByProduct: Record<string, string[]>;
  /** The car in the photo, once known: it picks the suggestions. */
  car: Car | null;
  /** How many renders one press may start. */
  cap: number;
  onBrand: (id: number, keepSearch?: boolean) => void;
  onSearch: (search: string) => void;
  onToggleWheel: (entry: CatalogueEntry) => void;
  onToggleFinish: (productId: string, variantId: string) => void;
  onClear: () => void;
  onRender: () => void;
  onChangePhoto: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const wheelImage = (p: Product) => p.reference_image_paths?.[0] || p.orthographic_image || "";
const variantImage = (v: Variant) => v.reference_image_paths?.[0] || v.reference_image || "";

const WheelGlyph = () => (
  <svg class="xw-glyph" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
    <circle cx="24" cy="24" r="19" />
    <circle cx="24" cy="24" r="4.5" />
    <path d="M24 5v14.5M24 28.5V43M5 24h14.5M28.5 24H43M10.6 10.6l10.3 10.3M27.1 27.1l10.3 10.3M37.4 10.6L27.1 20.9M20.9 27.1L10.6 37.4" />
  </svg>
);

/**
 * A wheel's picture. It is asked for only when its tile is near the screen, and until it lands a
 * wheel outline stands there, so a tile never stays a blank square.
 */
function WheelImage(props: { src: string; alt?: string }) {
  let box: HTMLSpanElement | undefined;
  const [seen, setSeen] = createSignal(false);
  const [ok, setOk] = createSignal(false);

  onMount(() => {
    if (!box || typeof IntersectionObserver === "undefined") {
      setSeen(true);

      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );

    io.observe(box);
    onCleanup(() => io.disconnect());
  });

  return (
    <span class="xw-wi" ref={box}>
      <Show when={!ok()}>
        <WheelGlyph />
      </Show>
      <Show when={seen() && props.src}>
        <img
          class={ok() ? "ok" : ""}
          src={props.src}
          alt={props.alt ?? ""}
          draggable={false}
          decoding="async"
          onLoad={() => setOk(true)}
        />
      </Show>
    </span>
  );
}

const Chevron = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/** A brand's mark on its own chip (dark ink on light, white or coloured on dark), or its name. */
function BrandMark(props: { name: string; logoUrl?: string | null }) {
  const logo = () => brandLogo(props.name, props.logoUrl);
  const [bad, setBad] = createSignal(false);

  return (
    <Show when={logo() && !bad()} fallback={<span class="xw-bn">{props.name}</span>}>
      <span class={`xw-bm ${logo()!.dark ? "lt" : "dk"}`}>
        <img src={logo()!.url} alt={props.name} draggable={false} onError={() => setBad(true)} />
      </span>
    </Show>
  );
}

/**
 * A dealer's code, photo in: the photo on the left, and on the right the studio's own picker. A
 * brand (its logo), a search, the wheels, the finishes opening under the wheel picked, and Render.
 * Several wheels can be picked, each with its own finishes, and rendered together.
 */
export function PickerView(props: PickerViewProps) {
  const [brandsOpen, setBrandsOpen] = createSignal(false);
  const [brandQ, setBrandQ] = createSignal("");
  const [seeAll, setSeeAll] = createSignal(false);
  const [suggestOpen, setSuggestOpen] = createSignal(true);
  const [seenReady, setSeenReady] = createSignal(0);
  let top: HTMLDivElement | undefined;

  const total = () => props.picks.reduce((n, p) => n + p.variantIds.length, 0);
  const atCap = () => total() >= props.cap;
  const pickOf = (id: string) => props.picks.find((p) => p.product.id === id);
  const doneOf = (id: string) => props.doneByProduct[id] ?? [];

  const brands = createMemo(() =>
    [...props.catalogue.brands]
      .filter((b) => props.catalogue.products.some((e) => Number(e.product.manufacturer_id) === Number(b.id)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })),
  );
  const brand = () => props.catalogue.brands.find((b) => Number(b.id) === Number(props.brandFilter)) ?? null;
  const shownBrands = createMemo(() => {
    const q = norm(brandQ());

    return q ? brands().filter((b) => norm(b.name).includes(q)) : brands();
  });

  const matches = createMemo(() => {
    const q = norm(props.search);
    const id = brand() ? Number(brand()!.id) : null;
    const rows = props.catalogue.products.filter((e) => id === null || Number(e.product.manufacturer_id) === id);

    if (!q) return [...rows].sort((a, b) => a.product.name.localeCompare(b.product.name, undefined, { numeric: true }));
    const byName = rows.filter((e) => norm(e.product.name).includes(q));
    const bySku = rows.filter((e) => !norm(e.product.name).includes(q) && norm(e.product.sku ?? "").includes(q));

    return [...byName, ...bySku];
  });

  /** The search has nothing in this brand: the other brands that do, most first. */
  const elsewhere = createMemo(() => {
    const q = norm(props.search);

    if (!q || matches().length > 0) return [];
    const count = new Map<number, number>();

    for (const e of props.catalogue.products) {
      if (norm(e.product.name).includes(q) || norm(e.product.sku ?? "").includes(q)) {
        const b = Number(e.product.manufacturer_id);

        count.set(b, (count.get(b) ?? 0) + 1);
      }
    }

    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, n]) => ({ id, n, name: props.catalogue.brands.find((b) => Number(b.id) === id)?.name ?? "" }))
      .filter((x) => x.name);
  });

  // Suggestions: the wheels the brands photographed on this car, kept to what the dealer offers.
  const byNumericId = createMemo(() => new Map(props.catalogue.products.map((e) => [Number(e.product.id), e])));

  createEffect(() => {
    if (props.car?.make) loadSeenOn().then((d) => d && setSeenReady((n) => n + 1));
  });
  const suggested = createMemo(() => {
    seenReady();
    if (!props.car || byNumericId().size === 0) return { name: null as string | null, list: [] as CatalogueEntry[] };
    const list = seenOn(props.car, (id) => byNumericId().has(id), 60)
      .map((s) => byNumericId().get(s.id)!)
      .filter(Boolean);

    return { name: carName(props.car) ?? [props.car.make, props.car.model].filter(Boolean).join(" "), list };
  });
  const showSuggested = () => suggestOpen() && suggested().list.length >= 2 && !props.search;
  const stripList = () => (seeAll() ? suggested().list : suggested().list.slice(0, STRIP));
  /** Wheels drawn in the strip: their tile there is only ticked, their finishes open under the strip. */
  const stripIds = createMemo(() => new Set(showSuggested() ? stripList().map((e) => e.product.id) : []));
  const stripOpen = () => stripList().filter((e) => pickOf(e.product.id) && e.variants.length > 1);

  // A new photo picks the first wheel on screen, as the studio does: Render is then one tap. It waits for the car
  // to be named, so the first suggestion is the one picked, and gives up waiting after a moment.
  const [waited, setWaited] = createSignal(false);

  onMount(() => {
    const t = setTimeout(() => setWaited(true), 5000);

    onCleanup(() => clearTimeout(t));
  });
  createEffect(() => {
    if (props.loading || props.catalogue.products.length === 0) return;
    if (!props.car && !waited()) return;
    // The car is named but the list of what the brands photographed on it has not come yet: wait for it.
    if (props.car?.make && seenReady() === 0 && !waited()) return;
    const first = showSuggested() ? stripList()[0] : matches()[0];

    props.onAutoPick(first ?? null);
  });

  // The queue under the grid: one line per render, with the wheel's photo, its finish and a way to take it off.
  const lines = createMemo(() =>
    props.picks.flatMap((p) => {
      const picked = p.variants.filter((v) => p.variantIds.includes(v.id));

      return picked.length > 0
        ? picked.map((v) => ({ pick: p, v: v as Variant | null }))
        : [{ pick: p, v: null as Variant | null }];
    }),
  );
  const [queueOpen, setQueueOpen] = createSignal(false);
  const note = () => (atCap() ? `You can render up to ${props.cap} at a time` : "");

  // The brand list closes on a tap anywhere else and on Escape.
  onMount(() => {
    const away = (e: Event) => {
      if (brandsOpen() && top && !e.composedPath().includes(top)) setBrandsOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && brandsOpen()) {
        e.stopPropagation();
        setBrandsOpen(false);
      }
    };

    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    onCleanup(() => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
    });
  });

  const Photo = () => (
    <div class="xw-pic xw-sp-photo" style={{ "--ar": String(props.ar) }}>
      <img class="xw-fg" src={props.previewUrl} alt="" draggable={false} />
      <button class="xw-ib tr" aria-label="Change the car photo" title="Change the car photo" onClick={() => props.onChangePhoto()}>
        <IconSwap />
      </button>
    </div>
  );

  const Tile = (t: { entry: CatalogueEntry; compact?: boolean; forceOpen?: boolean }) => {
    const id = () => t.entry.product.id;
    const pick = () => pickOf(id());
    const open = () => !!pick() && t.entry.variants.length > 1 && (t.forceOpen || (!t.compact && !stripIds().has(id())));
    const done = () => doneOf(id());
    const blocked = () => !pick() && atCap();

    return (
      <div class={`xw-wt ${pick() ? "on" : ""} ${open() ? "open" : ""} ${blocked() ? "off" : ""} ${t.compact ? "cp" : ""}`}>
        <button
          type="button"
          class="xw-wt-b"
          role="option"
          aria-selected={!!pick()}
          disabled={blocked()}
          title={blocked() ? `${t.entry.product.name}: no renders left to add it` : undefined}
          onClick={() => props.onToggleWheel(t.entry)}
        >
          <span class="xw-wt-img">
            <WheelImage src={wheelImage(t.entry.product)} alt={t.entry.product.name} />
            <Show when={pick()}>
              <i class="xw-wt-tk"><IconCheck /></i>
            </Show>
            <Show when={done().length > 0}>
              <i class="xw-wt-dn" title="Rendered on this photo"><IconCheck /></i>
            </Show>
          </span>
          <span class="xw-wt-tx">
            <b>{t.entry.product.name.replace(/-/g, "‑")}</b>
            <Show when={t.compact && !t.forceOpen}>
              <small>{props.catalogue.brands.find((b) => Number(b.id) === Number(t.entry.product.manufacturer_id))?.name}</small>
            </Show>
            <Show when={props.autoPick === id() && pick()}>
              <small>picked for you</small>
            </Show>
            <Show when={open()}>
              <small>
                {pick()!.variantIds.length === 0 ? "Pick one or more finishes" : `${pick()!.variantIds.length} of ${t.entry.variants.length} picked`}
              </small>
            </Show>
          </span>
        </button>
        <Show when={open()}>
          <div class="xw-fin" role="group" aria-label="Finish">
            <For each={pick()!.variants}>
              {(v) => {
                const on = () => pick()!.variantIds.includes(v.id);
                const dn = () => done().includes(v.id);
                const noRoom = () => !on() && atCap();

                return (
                  <button
                    type="button"
                    class={`xw-fn ${on() ? "on" : ""} ${dn() ? "dn" : ""}`}
                    aria-pressed={on()}
                    disabled={dn() || noRoom()}
                    title={dn() ? "Rendered on this photo" : noRoom() ? "No renders left to add this" : undefined}
                    onClick={() => props.onToggleFinish(id(), v.id)}
                  >
                    <span class="xw-fn-img" style={!variantImage(v) && v.hex_color ? { background: v.hex_color } : undefined}>
                      <Show when={variantImage(v)}>
                        <img src={variantImage(v)} alt="" draggable={false} loading="lazy" />
                      </Show>
                      <i class="xw-fn-tk"><IconCheck /></i>
                    </span>
                    <b>{v.variant_name}</b>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    );
  };

  const QueueLine = (l: { pick: Pick; v: Variant | null }, hint = "") => (
    <li class="xw-qn">
      <span class="xw-qn-i">
        <Show when={l.v && variantImage(l.v)} fallback={<WheelImage src={wheelImage(l.pick.product)} />}>
          <img src={variantImage(l.v!)} alt="" draggable={false} />
        </Show>
      </span>
      <span class="xw-qn-t">
        <b>{l.pick.product.name.replace(/-/g, "‑")}</b>
        <i aria-hidden="true">·</i>
        <span class={l.v ? "" : "need"}>{l.v ? l.v.variant_name : "Pick a finish"}</span>
      </span>
      <Show when={hint}>
        <small>{hint}</small>
      </Show>
      <button
        type="button"
        class="xw-qn-x"
        aria-label={l.v ? `Remove ${l.pick.product.name} in ${l.v.variant_name}` : `Remove ${l.pick.product.name}`}
        onClick={() =>
          l.v && l.pick.variantIds.length > 1 ? props.onToggleFinish(l.pick.product.id, l.v.id) : props.onToggleWheel({ product: l.pick.product, variants: l.pick.variants })
        }
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </li>
  );

  const label = () => (props.picks.length === 0 ? "Pick a wheel" : total() === 0 ? "Pick a finish" : "Render");

  return (
    <div class="xw-split">
      <div class="xw-sp-pic">
        <Photo />
      </div>

      <div class="xw-pk">
        <div class="xw-pk-top" ref={top}>
          <button
            type="button"
            class="xw-bb"
            aria-haspopup="listbox"
            aria-expanded={brandsOpen()}
            disabled={props.loading}
            onClick={() => setBrandsOpen(!brandsOpen())}
          >
            <Show when={brand()} fallback={<span class="xw-bn">Brands</span>}>
              <BrandMark name={brand()!.name} logoUrl={brand()!.logo_url} />
            </Show>
            <Chevron />
          </button>
          <label class="xw-sf">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
          <input
            class="xw-in xw-pk-s"
            type="search"
            placeholder="Search wheels"
            aria-label="Search wheels"
            value={props.search}
            disabled={props.loading}
            onInput={(e) => props.onSearch(e.currentTarget.value)}
          />
          </label>

          <Show when={brandsOpen()}>
            <div class="xw-bl" role="listbox" aria-label="Brands">
              <Show when={brands().length > 12}>
                <input
                  class="xw-in xw-bl-s"
                  type="search"
                  placeholder="Search brands"
                  aria-label="Search brands"
                  value={brandQ()}
                  onInput={(e) => setBrandQ(e.currentTarget.value)}
                />
              </Show>
              <div class="xw-bl-g">
                <For each={shownBrands()}>
                  {(b) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={Number(b.id) === Number(props.brandFilter)}
                      class={`xw-bl-t ${Number(b.id) === Number(props.brandFilter) ? "on" : ""}`}
                      onClick={() => {
                        props.onBrand(Number(b.id));
                        setBrandsOpen(false);
                        setBrandQ("");
                      }}
                    >
                      <BrandMark name={b.name} logoUrl={b.logo_url} />
                    </button>
                  )}
                </For>
                <Show when={shownBrands().length === 0}>
                  <p class="xw-pk-none">No brand matches that name</p>
                </Show>
              </div>
            </div>
          </Show>
        </div>

        <div class="xw-pk-grid" role="listbox" aria-label="Wheels" aria-multiselectable="true">
          <Show when={props.loading}>
            <For each={Array.from({ length: 9 })}>
              {() => (
                <div class="xw-wt sk" aria-hidden="true">
                  <span class="xw-wt-img" />
                  <span class="xw-wt-tx"><b>&nbsp;</b></span>
                </div>
              )}
            </For>
          </Show>

          <Show when={!props.loading}>
            <Show when={showSuggested()}>
              <section class="xw-sg" aria-label="Suggested">
                <div class="xw-sg-h">
                  <b>Suggested for {suggested().name}</b>
                  <span>
                    <Show when={suggested().list.length > STRIP}>
                      <button type="button" class="xw-link" onClick={() => setSeeAll(!seeAll())}>
                        {seeAll() ? "Show less" : `See all ${suggested().list.length}`}
                      </button>
                    </Show>
                    <button type="button" class="xw-sg-x" aria-label="Close the suggestions" onClick={() => setSuggestOpen(false)}>
                      ×
                    </button>
                  </span>
                </div>
                <div class={`xw-sg-r ${seeAll() ? "all" : ""}`}>
                  <For each={stripList()}>
                    {(e) => <Tile entry={e} compact />}
                  </For>
                </div>
                <For each={stripOpen()}>
                  {(e) => (
                    <div class="xw-sg-o">
                      <Tile entry={e} forceOpen />
                    </div>
                  )}
                </For>
              </section>
            </Show>

            <For each={matches().slice(0, SHOWN)}>{(e) => <Tile entry={e} />}</For>

            <Show when={matches().length === 0}>
              <div class="xw-pk-none">
                <p>No wheels match</p>
                <Show when={elsewhere().length > 0}>
                  <div class="xw-el">
                    <For each={elsewhere()}>
                      {(x) => (
                        <button type="button" class="xw-link" onClick={() => props.onBrand(x.id, true)}>
                          {x.n} in {x.name}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </Show>
            <Show when={matches().length > SHOWN}>
              <p class="xw-pk-none">Search to see more</p>
            </Show>
          </Show>
        </div>

        <Show when={lines().length > 0}>
          <div class="xw-qq">
            <Show
              when={lines().length > 1}
              fallback={<ul>{QueueLine(lines()[0], note())}</ul>}
            >
              <div class="xw-qq-h">
                <button type="button" class="xw-qq-t" aria-expanded={queueOpen()} onClick={() => setQueueOpen(!queueOpen())}>
                  <b>{lines().length} renders</b>
                  <svg class={queueOpen() ? "up" : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                  <Show when={note()}>
                    <small>{note()}</small>
                  </Show>
                </button>
                <Show when={queueOpen()}>
                  <button type="button" class="xw-qq-c" onClick={() => props.onClear()}>Clear</button>
                </Show>
              </div>
              <Show when={queueOpen()}>
                <ul class="xw-qq-l">
                  <For each={lines()}>{(l) => QueueLine(l)}</For>
                </ul>
              </Show>
            </Show>
          </div>
        </Show>

        <MetalButton class="xw-cta" ring="4px" disabled={total() === 0} onClick={() => props.onRender()}>
          <span>{label()}</span>
          <Show when={total() > 1}>
            <span class="xw-chip">{total()} renders</span>
          </Show>
        </MetalButton>
      </div>
    </div>
  );
}
