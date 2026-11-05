import { createSignal, Show, type JSX } from "solid-js";
import type { ProblemKind } from "../../types";
import { okEmail } from "./QuoteView";
import { IconCheck, IconClock, IconPause, IconPhoto, IconWarn, IconX } from "./icons";

/** What a notice's buttons do. The Modal carries them out. */
export type NoticeAction = "quote" | "back" | "retry" | "photo" | "reload" | "pick";

interface Note {
  icon: () => JSX.Element;
  h: string;
  p?: string;
  a: [string, NoticeAction];
  b?: [string, NoticeAction];
}

/**
 * Every limit and error, in the CD's words (round 16, Rules and errors tab). No number, no
 * count, no time and no timer on any of them.
 */
const NOTES: Record<ProblemKind, Note> = {
  limit: { icon: IconClock, h: "You've hit your limit", p: "Please come back later.", a: ["Request quote", "quote"] },
  slow: { icon: IconClock, h: "You're going fast", p: "Wait a moment, then try again.", a: ["Try again", "back"] },
  paused: { icon: IconPause, h: "Renders are paused", p: "Please come back later.", a: ["Request quote", "quote"] },
  fail: { icon: IconWarn, h: "Render failed", a: ["Try again", "retry"] },
  timeout: { icon: IconClock, h: "Taking longer than usual", a: ["Keep waiting", "back"], b: ["Try again", "retry"] },
  nocar: { icon: IconPhoto, h: "No car found", p: "Try a side photo.", a: ["Try another photo", "photo"] },
  nowheels: { icon: IconPhoto, h: "Wheels not visible", p: "Both wheels need to show.", a: ["Try another photo", "photo"] },
  badfile: { icon: IconPhoto, h: "Can't use that photo", p: "Use a JPG, PNG or WebP under 20 MB.", a: ["Try another photo", "photo"] },
  expired: { icon: IconClock, h: "Session ended", a: ["Reload", "reload"] },
  gone: { icon: IconWarn, h: "Wheel not available", a: ["Pick another wheel", "pick"] },
  nolist: { icon: IconWarn, h: "Wheels not available", a: ["Try again", "reload"] },
};

const Close = (props: { onClick: () => void }) => (
  <button class="xw-dx" aria-label="Close" onClick={() => props.onClick()}>
    <IconX />
  </button>
);

/** The dimmed layer every pop-up sits on. It covers the picture; the header dims with it. */
export function Overlay(props: { children: JSX.Element; onOutside?: () => void }) {
  return (
    <div class="xw-ov" onClick={(e) => e.target === e.currentTarget && props.onOutside?.()}>
      {props.children}
    </div>
  );
}

export function NoticeCard(props: { kind: ProblemKind; onClose: () => void; onAction: (a: NoticeAction) => void }) {
  const note = () => NOTES[props.kind];

  return (
    <div class="xw-card nt" role="alertdialog" aria-label={note().h}>
      <Close onClick={props.onClose} />
      <span class="xw-nic">{note().icon()}</span>
      <h3>{note().h}</h3>
      <Show when={note().p}>
        <p>{note().p}</p>
      </Show>
      <button class="xw-btn full" onClick={() => props.onAction(note().a[1])}>{note().a[0]}</button>
      <Show when={note().b}>
        <button class="xw-link" onClick={() => props.onAction(note().b![1])}>{note().b![0]}</button>
      </Show>
    </div>
  );
}

/** S4: the quote went to the brand. */
export function SentCard(props: { brandName: string; onClose: () => void }) {
  return (
    <div class="xw-card" role="dialog" aria-label="Quote requested">
      <Close onClick={props.onClose} />
      <div class="xw-okc"><IconCheck /></div>
      <h3>Quote requested</h3>
      <p>{props.brandName} will be in touch.</p>
      <button class="xw-link" onClick={() => props.onClose()}>Keep designing</button>
    </div>
  );
}

/** S5: leaving with renders not sent anywhere. Only offered when the backend can email them (R7). */
export function LeaveCard(props: {
  email: string;
  onEmail: (email: string) => void;
  onStay: () => void;
  onLeave: () => void;
  /** Resolves when emailed; rejects to show "Couldn't email them. Try again." */
  onSend: (email: string) => Promise<void>;
}) {
  // The form starts from what the visitor already typed elsewhere, then owns its own values.
  // eslint-disable-next-line solid/reactivity
  const [email, setEmail] = createSignal(props.email);
  const [failed, setFailed] = createSignal(false);
  const [sending, setSending] = createSignal(false);

  const send = async (e: Event) => {
    e.preventDefault();
    if (!okEmail(email()) || sending()) return;
    setSending(true);
    setFailed(false);
    try {
      await props.onSend(email().trim());
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <form class="xw-card small leave" role="dialog" aria-label="Keep your renders?" onSubmit={send} novalidate>
      <Close onClick={props.onStay} />
      <h3>Keep your renders?</h3>
      <p>We'll email them to you.</p>
      <input
        class="xw-in"
        placeholder="Email"
        type="email"
        inputmode="email"
        autocomplete="email"
        value={email()}
        onInput={(e) => {
          setEmail(e.currentTarget.value);
          props.onEmail(e.currentTarget.value);
        }}
      />
      <Show when={failed()}>
        <p class="xw-err">Couldn't email them. Try again.</p>
      </Show>
      <button type="submit" class="xw-btn full" disabled={!okEmail(email()) || sending()}>Email my renders</button>
      <button type="button" class="xw-link" onClick={() => props.onLeave()}>Leave without saving</button>
    </form>
  );
}

/** S6: the renders are on their way. Done closes the window. */
export function EmailedCard(props: { email: string; onDone: () => void }) {
  return (
    <div class="xw-card" role="dialog" aria-label="Sent">
      <Close onClick={props.onDone} />
      <div class="xw-okc"><IconCheck /></div>
      <h3>Sent</h3>
      <p>Check {props.email}.</p>
      <button class="xw-btn full" onClick={() => props.onDone()}>Done</button>
    </div>
  );
}
