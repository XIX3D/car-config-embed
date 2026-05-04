import { createSignal, Show } from "solid-js";
import type { EmailGateResponse } from "../../types";
import { ModalHeader } from "./ModalHeader";

interface CustomerData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

interface EmailGateViewProps {
  productImgUrl: string;
  brandName: string;
  modelName: string;
  data: EmailGateResponse;
  onClose: () => void;
  onSubmit: (customer: CustomerData) => Promise<void>;
}

export function EmailGateView(props: EmailGateViewProps) {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const isValid = () => email().trim().length > 0 && name().trim().length > 0;

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!isValid()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await props.onSubmit({
        name: name().trim(),
        email: email().trim(),
        phone: phone().trim() || undefined,
        address: address().trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div class="relative z-1 pt-6 pb-3 px-6 flex flex-col min-h-[520px] max-h-[90vh] overflow-y-auto scrollbar-hide">
      <ModalHeader
        brandName={props.brandName}
        modelName={props.modelName}
        productImgUrl={props.productImgUrl}
        onClose={props.onClose}
      />

      <div class="animate-fadeInUp opacity-0 [animation-delay:0.1s] mt-4 mb-5 text-center">
        <h3 class="text-xl font-semibold text-white m-0 mb-2">
          Your render is ready.
        </h3>
        <p class="text-sm text-white/50">
          Enter your details to continue.
        </p>
      </div>

      <form
        class="flex flex-col gap-2.5 max-w-[400px] w-full mx-auto"
        onSubmit={handleSubmit}
      >
        <div class="animate-fadeInUp opacity-0 [animation-delay:0.2s]">
          <input
            type="text"
            name="name"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-dinpro transition-all outline-none focus:border-[var(--theme-primary)]/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Name *"
            required
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.25s]">
          <input
            type="email"
            name="email"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-dinpro transition-all outline-none focus:border-[var(--theme-primary)]/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Your Email *"
            required
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.3s]">
          <input
            type="tel"
            name="phone"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-dinpro transition-all outline-none focus:border-[var(--theme-primary)]/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Phone (optional)"
            value={phone()}
            onInput={(e) => setPhone(e.currentTarget.value)}
          />
        </div>

        <div class="animate-fadeInUp opacity-0 [animation-delay:0.35s]">
          <input
            type="text"
            name="address"
            autocomplete="street-address"
            class="w-full p-3.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-dinpro transition-all outline-none focus:border-[var(--theme-primary)]/60 focus:bg-white/[0.08] placeholder:text-white/30"
            placeholder="Address (optional)"
            value={address()}
            onInput={(e) => setAddress(e.currentTarget.value)}
          />
        </div>

        <Show when={error()}>
          <div class="text-xs text-red-400 mt-1 ml-1">{error()}</div>
        </Show>

        <div class="relative w-full animate-fadeInUp opacity-0 [animation-delay:0.4s] mt-1">
          <button
            type="submit"
            class="relative w-full py-3.5 rounded-2xl text-[15px] font-medium cursor-pointer flex items-center justify-center gap-3 transition-all bg-zeno-electric text-white border-none hover:opacity-90 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            disabled={isSubmitting() || !isValid()}
          >
            {isSubmitting() ? "Submitting..." : "Resume"}
          </button>
        </div>
      </form>

      <div class="text-white/40 text-xs text-center pt-3 mt-auto">
        Powered by <strong class="text-white/60 font-semibold">XIX3D</strong>
      </div>
    </div>
  );
}
