import { createSignal, For, Show, onMount } from "solid-js";
import type { RenderResult } from "../../types";
import type { Lead } from "../../stores/widget-store";
import { IconBack, IconHeart } from "./icons";

interface QuoteViewProps {
  brandName: string;
  /** "2020 Ferrari F8 Tributo", when the car was recognised. */
  vehicle: string | null;
  results: RenderResult[];
  current: RenderResult | null;
  /** Shown when there is no render yet (a quote asked from the limit or paused screen). */
  photo: string | null;
  interested: number[];
  lead: Lead;
  onBack: () => void;
  onFocus: (id: number) => void;
  onToggleInterest: (id: number) => void;
  onLead: (lead: Lead) => void;
  /** Resolves when sent; rejects to show "Couldn't send. Try again." with the form kept. */
  onSubmit: (lead: Lead) => Promise<void>;
}

export const okEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

/** S3: Request quote, its own full-window screen. Name, email, phone (optional). */
export function QuoteView(props: QuoteViewProps) {
  // The form starts from what the visitor already typed elsewhere, then owns its own values.
  // eslint-disable-next-line solid/reactivity
  const [form, setForm] = createSignal<Lead>({ ...props.lead });
  const [sending, setSending] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  let wrRef: HTMLDivElement | undefined;

  const set = (k: keyof Lead, v: string) => {
    setForm({ ...form(), [k]: v });
    props.onLead(form());
  };
  const ready = () => !!form().name.trim() && okEmail(form().email) && !sending();
  const picture = () => props.current?.image || props.photo;

  // The render on screen sits in the middle of the row when there are many.
  onMount(() => {
    const fo = wrRef?.querySelector<HTMLElement>(".fo");

    if (wrRef && fo) wrRef.scrollLeft = Math.max(0, fo.offsetLeft - (wrRef.clientWidth - fo.offsetWidth) / 2);
  });

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!ready()) return;
    setSending(true);
    setFailed(false);
    try {
      await props.onSubmit(form());
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="xw-q">
      <div class="xw-qs">
        <div class="xw-qh">
          <button class="xw-round" aria-label="Back to my renders" onClick={() => props.onBack()}>
            <IconBack />
          </button>
          <div>
            <h3>Request quote</h3>
            <Show when={props.vehicle}>
              <div class="xw-sub">{props.vehicle}</div>
            </Show>
          </div>
        </div>

        <Show when={picture()}>
          <img class="xw-qimg" src={picture()!} alt="" />
        </Show>

        <Show when={props.results.length > 1}>
          <div class="xw-ql">Interested in</div>
        </Show>
        <Show when={props.results.length > 0}>
          <div class="xw-wr" ref={wrRef}>
            <For each={props.results}>
              {(r) => {
                const on = () => props.interested.includes(r.id);

                return (
                  <button
                    type="button"
                    class={`${on() ? "on" : ""} ${r.id === props.current?.id ? "fo" : ""}`}
                    aria-pressed={on()}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-heart]")) props.onToggleInterest(r.id);
                      else props.onFocus(r.id);
                    }}
                  >
                    <span class="xw-wc">
                      <Show when={r.referenceImage}>
                        <img src={r.referenceImage!} alt="" />
                      </Show>
                      <i class="xw-hb" data-heart aria-label={on() ? "In the quote" : "Add to the quote"}>
                        <IconHeart on={on()} />
                      </i>
                    </span>
                    <b>{r.label}</b>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        <form class="xw-qf" onSubmit={submit} novalidate>
          <input class="xw-in" placeholder="Your name" autocomplete="name" value={form().name} onInput={(e) => set("name", e.currentTarget.value)} />
          <input class="xw-in" placeholder="Email" type="email" inputmode="email" autocomplete="email" value={form().email} onInput={(e) => set("email", e.currentTarget.value)} />
          <input class="xw-in" placeholder="Phone (optional)" type="tel" inputmode="tel" autocomplete="tel" value={form().phone} onInput={(e) => set("phone", e.currentTarget.value)} />
          <Show when={failed()}>
            <p class="xw-err">Couldn't send. Try again.</p>
          </Show>
          <button type="submit" class="xw-btn full" disabled={!ready()}>Request quote</button>
          <p class="xw-foot">
            {props.brandName} will contact you ·{" "}
            <a href="https://xix3d.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
          </p>
        </form>
      </div>
    </div>
  );
}
