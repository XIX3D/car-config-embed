import { createSignal, Show } from "solid-js";
import type { Lead } from "../../stores/widget-store";
import { okEmail } from "./QuoteView";

interface EmailGateViewProps {
  brandName: string;
  lead: Lead;
  /** Before the photo, the line under the title says what comes next. */
  beforePhoto: boolean;
  onLead: (lead: Lead) => void;
  /** Resolves when taken; rejects to show "Couldn't send. Try again." with the form kept. */
  onSubmit: (lead: Lead) => Promise<void>;
}

/**
 * G1, "Your details": name, email, phone (optional), asked before the photo when the brand turns
 * it on (backend R3), and the same screen when the long-standing email gate asks. What is typed
 * here fills the quote form later.
 */
export function EmailGateView(props: EmailGateViewProps) {
  // The form starts from what the visitor already typed elsewhere, then owns its own values.
  // eslint-disable-next-line solid/reactivity
  const [form, setForm] = createSignal<Lead>({ ...props.lead });
  const [badEmail, setBadEmail] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [sending, setSending] = createSignal(false);

  const set = (k: keyof Lead, v: string) => {
    setForm({ ...form(), [k]: v });
    props.onLead(form());
  };
  const filled = () => !!form().name.trim() && !!form().email.trim() && !sending();

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!filled()) return;
    setFailed(false);
    if (!okEmail(form().email)) {
      setBadEmail(true);

      return;
    }
    setBadEmail(false);
    setSending(true);
    try {
      await props.onSubmit(form());
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div class="xw-gt">
      <form class="xw-gtc" onSubmit={submit} novalidate>
        <h3 style={props.beforePhoto ? undefined : { "margin-bottom": "22px" }}>Your details</h3>
        <Show when={props.beforePhoto}>
          <p class="xw-gts">Then add your car photo.</p>
        </Show>
        <input class="xw-in" placeholder="Your name" autocomplete="name" value={form().name} onInput={(e) => set("name", e.currentTarget.value)} />
        <input
          class={`xw-in ${badEmail() ? "bad" : ""}`}
          placeholder="Email"
          type="email"
          inputmode="email"
          autocomplete="email"
          value={form().email}
          onInput={(e) => set("email", e.currentTarget.value)}
        />
        <input class="xw-in" placeholder="Phone (optional)" type="tel" inputmode="tel" autocomplete="tel" value={form().phone} onInput={(e) => set("phone", e.currentTarget.value)} />
        <Show when={badEmail()}>
          <p class="xw-err">Check your email.</p>
        </Show>
        <Show when={failed()}>
          <p class="xw-err">Couldn't send. Try again.</p>
        </Show>
        <button type="submit" class="xw-btn" disabled={!filled()}>Continue</button>
        <p class="xw-foot">
          {props.brandName} will contact you ·{" "}
          <a href="https://xix3d.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>
        </p>
      </form>
    </div>
  );
}
