import { Show, Switch, Match, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { WidgetStore, Lead } from "../../stores/widget-store";
import type { ApiClient } from "../../utils/api";
import type { ProblemKind, RenderProblem, Variant } from "../../types";
import { debugWarn } from "../../utils/debug";
import { ModalHeader } from "./ModalHeader";
import { UploadView } from "./UploadView";
import { LoadingView } from "./LoadingView";
import { ResultView } from "./ResultView";
import { QuoteView } from "./QuoteView";
import { EmailGateView } from "./EmailGateView";
import { EmailedCard, LeaveCard, NoticeCard, Overlay, SentCard, type NoticeAction } from "./Popups";
import { IconX } from "./icons";

interface ModalProps {
  store: WidgetStore;
  api: ApiClient;
  shadowRoot: ShadowRoot;
  /** Opens the same preview again, for "Session ended" (E7). */
  onReload?: () => void;
}

/** The CD's E4: after about 90 seconds the visitor may keep waiting or try again. */
const TAKING_LONG_MS = 90_000;

/** Photo problems end on the upload screen: that photo will fail the same way again. */
const PHOTO_PROBLEMS: ProblemKind[] = ["nocar", "nowheels", "badfile"];

/**
 * Phone layout: the picture on top, buttons pinned at the bottom. Width only: a phone on its
 * side keeps the desk layout (picture with its bar under it), only full screen.
 */
function usePhone() {
  const mq = window.matchMedia("(max-width: 700px)");
  const [phone, setPhone] = createSignal(mq.matches);
  const update = () => setPhone(mq.matches);

  mq.addEventListener("change", update);
  onCleanup(() => mq.removeEventListener("change", update));

  return phone;
}

export function Modal(props: ModalProps) {
  // eslint-disable-next-line solid/reactivity
  const { state, actions, getLoadingSteps, getBrandName, getModelName, getCurrentResult, getDoneResults, isLimitReached, isV2LoadingEnabled } = props.store;
  const phone = usePhone();
  const [ar, setAr] = createSignal(1.5);
  /** The visitor picked a render while the next was still coming: show it clean, no animation on it. */
  const [looking, setLooking] = createSignal(false);

  /** One per render in flight, so closing, "Try again" and a dead photo can cancel them. */
  const controllers = new Map<number, AbortController>();
  /** The finish each slot is rendering, for "Try again". */
  const slotVariant = new Map<number, string>();
  /** Finishes whose render failed, waiting for "Try again". */
  let failedVariants: string[] = [];
  let slowTimer = 0;
  let slowSlot = 0;

  const productImgUrl = () => state.product?.reference_image_paths?.[0] || "";
  const sortedVariants = () =>
    [...(state.variants || [])].sort(
      (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER),
    );
  const variantById = (id: string) => state.variants.find((v) => v.id === id);
  /** Finishes rendered, or rendering, on the photo on screen. */
  const doneVariantIds = () =>
    state.galleryResults
      .filter((r) => r.photoKey === state.photoKey && (r.success || r.loading) && r.variantId)
      .map((r) => r.variantId!);
  /** Every finish has a finished render on this photo: More finishes becomes New photo. */
  const allDone = () =>
    sortedVariants().every((v) =>
      state.galleryResults.some((r) => r.photoKey === state.photoKey && r.success && r.variantId === v.id));
  const pending = () => state.galleryResults.some((r) => r.loading);
  const vehicle = () => {
    const v = state.detectedVehicle;

    return v?.make ? [v.year, v.make, v.model].filter(Boolean).join(" ") : null;
  };
  const canEmailRenders = () => state.emailRendersOn && state.renderLogIds.length > 0;
  const nothingToLose = () => !state.hasRendered || state.quoteSent || state.rendersEmailed;

  const abortAll = () => {
    controllers.forEach((c) => c.abort());
    controllers.clear();
    clearTimeout(slowTimer);
  };

  const closeAll = () => {
    abortAll();
    actions.close();
  };

  onCleanup(abortAll);

  /** The slot ended: when nothing is left in flight, the loading clock stops. */
  const settle = (id: number) => {
    controllers.delete(id);
    slotVariant.delete(id);
    if (slowSlot === id) clearTimeout(slowTimer);
    if (!pending()) actions.stopLoading();
  };

  /** E4 watches one render at a time: the one now running. */
  const watchSlow = (id: number) => {
    clearTimeout(slowTimer);
    slowSlot = id;
    slowTimer = window.setTimeout(() => {
      const slot = state.galleryResults.find((r) => r.id === id);

      if (slot?.loading && !state.notice && !state.popup) actions.setNotice("timeout");
    }, TAKING_LONG_MS);
  };

  const productsFor = (variantId: string) => {
    const products: Array<{ product_id: string; variant_id?: string }> = [];
    const sel = state.selections;

    if (sel?.wrap_id) products.push({ product_id: sel.wrap_id, variant_id: variantId });
    if (sel?.wheel_id) products.push({ product_id: sel.wheel_id, variant_id: variantId });

    return products;
  };

  const handleProblem = (id: number, variantId: string, problem: RenderProblem) => {
    debugWarn(`render ended without an image: ${problem.kind}${problem.code ? ` (${problem.code})` : ""}`);
    actions.dropSlot(id);
    settle(id);

    if (problem.kind === "limit") {
      const limit = problem.limit ?? state.visitorLimit;

      if (limit != null) actions.setVisitorUsage({ limit, used: problem.used ?? limit });
    }

    if (problem.kind === "fail") {
      failedVariants = [...new Set([...failedVariants, variantId])];
    } else {
      // Every render behind this one would be refused the same way, and none should run.
      abortAll();
      state.galleryResults.filter((r) => r.loading).forEach((r) => actions.dropSlot(r.id));
      actions.stopLoading();
    }

    if (PHOTO_PROBLEMS.includes(problem.kind)) {
      actions.clearFile();
    } else if (problem.kind !== "fail" && state.view === "loading") {
      // A limit, a pause or a throttle: back to the photo and finishes, as the mock draws it.
      actions.setView("upload");
    }
    // On the result screen the bar already says it (E1); the pop-up (E2) is for a new attempt.
    if (problem.kind === "limit" && state.view === "result" && isLimitReached()) return;
    actions.setNotice(problem.kind);
  };

  const runSlot = (id: number, file: File, variantId: string, first: boolean) => {
    const ctrl = new AbortController();

    controllers.set(id, ctrl);
    slotVariant.set(id, variantId);
    if (first) watchSlow(id);

    props.api
      .renderStream(
        file,
        productsFor(variantId),
        state.product!.manufacturer_id,
        {
          // Renders run one after another; each one that starts after the first gets the
          // animation from its first step, on the result screen the visitor is already on.
          onStarted: () => {
            if (!first) actions.restartLoading();
            watchSlow(id);
          },
          onVehicleDetected: (data) => actions.setDetectedVehicle(data),
          // Two-pass stage events drive the animation's step from real progress.
          onMaskStarted: (data) => {
            actions.setMaskCached(data.cached);
            actions.syncLoadingStage("mask");
          },
          onMaskComplete: (data) => actions.setMaskCached(data.cached),
          onFillStarted: () => actions.syncLoadingStage("fill"),
          onCompositeComplete: () => actions.syncLoadingStage("composite"),
          onDebug: (data) => actions.setDebugData(data),
          onComplete: (data) => {
            setLooking(false);
            actions.completeSlot(id, `data:image/png;base64,${data.image_b64}`);
          },
          // Comparison build only: the image the audit rejected, shown so it can be judged.
          onAuditFailedImage: (dataUrl) => actions.completeSlot(id, dataUrl),
          onRecorded: (ids) => actions.addRenderLogIds(ids),
          onVisitorUsage: (usage) => actions.setVisitorUsage(usage),
          onEmailGateRequired: (gate) => {
            abortAll();
            state.galleryResults.filter((r) => r.loading).forEach((r) => actions.dropSlot(r.id));
            actions.stopLoading();
            actions.setView("upload");
            actions.setEmailGate(gate);
          },
          onProblem: (problem) => handleProblem(id, variantId, problem),
        },
        ctrl.signal,
      )
      .finally(() => {
        if (controllers.get(id) === ctrl) settle(id);
      });
  };

  /** Render the given finishes on the photo on screen, one after another. */
  const startRender = (variantIds: string[]) => {
    const file = state.selectedFile;
    const variants = variantIds.map(variantById).filter((v): v is Variant => !!v);

    if (!file || !state.product || variants.length === 0) return;
    if (isLimitReached()) {
      actions.setNotice("limit");

      return;
    }

    failedVariants = [];
    actions.startLoading(isV2LoadingEnabled());
    const ids = actions.addSlots(
      variants.map((v) => ({
        label: v.variant_name,
        variantId: v.id,
        hexColor: v.hex_color || null,
        referenceImage: v.reference_image_paths?.[0] || v.reference_image || null,
        photo: state.previewDataUrl,
        photoKey: state.photoKey,
      })),
    );

    ids.forEach((id, k) => runSlot(id, file, variants[k].id, k === 0));
  };

  const renderPicked = () => {
    const done = doneVariantIds();

    startRender(sortedVariants().filter((v) => state.selectedVariantIds.includes(v.id) && !done.includes(v.id)).map((v) => v.id));
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();

    reader.onload = (e) => actions.setFile(file, e.target?.result as string, sortedVariants()[0]?.id);
    reader.readAsDataURL(file);
  };

  /** After a notice closes: a loading screen with nothing left to wait for goes back to the photo. */
  const afterNotice = () => {
    if (state.view === "loading" && !pending()) actions.setView(getDoneResults().length ? "result" : "upload");
  };

  const handleNoticeAction = (action: NoticeAction) => {
    const kind = state.notice;

    actions.setNotice(null);

    if (action === "quote") {
      actions.showQuote();
    } else if (action === "photo") {
      actions.clearFile();
    } else if (action === "reload") {
      abortAll();
      props.onReload?.();
    } else if (action === "retry") {
      if (kind === "timeout") {
        // Give up on the slow one and ask again. Cancelling it here never counts (R5).
        const slow = state.galleryResults.find((r) => r.id === slowSlot && r.loading);

        if (slow) {
          controllers.get(slow.id)?.abort();
          actions.dropSlot(slow.id);
          settle(slow.id);
          startRender([slow.variantId!]);

          return;
        }
      }
      const again = failedVariants;

      failedVariants = [];
      if (again.length) startRender(again);
      else afterNotice();
    } else {
      afterNotice();
    }
  };

  const closeNotice = () => {
    actions.setNotice(null);
    afterNotice();
  };

  const tryClose = () => {
    if (!nothingToLose() && canEmailRenders()) actions.setPopup("leave");
    else closeAll();
  };

  /** A click on the dark page around the window: never loses renders by accident. */
  const outsideClick = () => {
    if (nothingToLose()) closeAll();
    else if (canEmailRenders()) actions.setPopup("leave");
  };

  const quoteSubmit = async (lead: Lead) => {
    if (!state.product) throw new Error("No product");
    const picks = state.galleryResults.filter((r) => state.interested.includes(r.id) && r.image);
    const productIds = [state.selections?.wheel_id, state.selections?.wrap_id]
      .filter((id): id is string => !!id)
      .map((id) => parseInt(id, 10));
    const res = await props.api.submitQuote({
      name: lead.name.trim(),
      email: lead.email.trim(),
      phone: lead.phone.trim() || undefined,
      vehicle_info: state.detectedVehicle ?? undefined,
      product_ids: productIds,
      images: picks.map((r) => r.image!),
      variant_ids: picks.map((r) => parseInt(r.variantId ?? "", 10)).filter(Number.isFinite),
      manufacturer_id: state.product.manufacturer_id,
    });

    if (res.success) {
      actions.markQuoteSent();
    } else if (res.status === 401) {
      actions.setNotice("expired");
    } else {
      throw new Error("send failed");
    }
  };

  const detailsSubmit = async (lead: Lead) => {
    if (!state.product) throw new Error("No product");
    const productIds = [state.selections?.wheel_id, state.selections?.wrap_id]
      .filter((id): id is string => !!id)
      .map((id) => parseInt(id, 10));
    const res = await props.api.submitLead({
      name: lead.name.trim(),
      email: lead.email.trim(),
      phone: lead.phone.trim() || undefined,
      product_ids: productIds,
      manufacturer_id: state.product.manufacturer_id,
    });

    if (res.success) actions.detailsDone();
    else if (res.status === 401) actions.setNotice("expired");
    else throw new Error("send failed");
  };

  const emailRenders = async (email: string) => {
    actions.setLead({ email });
    const res = await props.api.emailRenders(email, state.renderLogIds);

    if (res.success) actions.markRendersEmailed();
    else throw new Error("send failed");
  };

  const selectNext = () => {
    const done = getDoneResults();
    const i = done.findIndex((r) => r.id === state.currentId);

    setLooking(true);
    if (done.length) actions.select(done[(i + 1) % done.length].id);
  };

  // A visitor already at the limit learns it the moment the window opens, not after a photo.
  createEffect(on(() => state.emailGate, (gate) => {
    if (gate && isLimitReached() && !state.hasRendered) actions.setNotice("limit");
  }));

  // Esc steps back: the full-screen view, then a pop-up. It never closes the window.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !state.isOpen) return;
      if (state.showFullscreen) actions.toggleFullscreen(false);
      else if (state.notice) closeNotice();
      else if (state.popup) actions.setPopup(null);
    };

    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  createEffect(() => {
    document.body.style.overflow = state.isOpen ? "hidden" : "";
  });
  onCleanup(() => {
    document.body.style.overflow = "";
  });

  const dimmed = () => !!state.notice || !!state.popup;

  return (
    <Show when={state.isOpen}>
      <Portal mount={props.shadowRoot}>
        <div class={`xw ${phone() ? "ph" : ""}`} onClick={(e) => e.target === e.currentTarget && outsideClick()}>
          <div class={`xw-sheet ${dimmed() ? "dim" : ""}`} role="dialog" aria-modal="true" aria-label={`${getBrandName()} - ${getModelName()}`}>
            <ModalHeader brandName={getBrandName()} modelName={getModelName()} productImgUrl={productImgUrl()} onClose={tryClose} />

            <div class="xw-stage">
              <Switch>
                <Match when={state.view === "details"}>
                  <EmailGateView
                    brandName={getBrandName()}
                    lead={state.lead}
                    beforePhoto={!state.previewDataUrl}
                    onLead={(lead) => actions.setLead(lead)}
                    onSubmit={detailsSubmit}
                  />
                </Match>

                <Match when={state.view === "upload"}>
                  <UploadView
                    phone={phone()}
                    ar={ar()}
                    variants={sortedVariants()}
                    selectedVariantIds={state.selectedVariantIds}
                    doneVariantIds={doneVariantIds()}
                    previewUrl={state.previewDataUrl}
                    onFileSelect={handleFileSelect}
                    onToggleVariant={actions.toggleVariantSelection}
                    onRender={renderPicked}
                    onChangePhoto={actions.clearFile}
                    onBadFile={() => actions.setNotice("badfile")}
                    onAspect={setAr}
                  />
                </Match>

                <Match when={state.view === "loading"}>
                  <LoadingView
                    phone={phone()}
                    ar={ar()}
                    previewDataUrl={state.previewDataUrl}
                    loadingSteps={getLoadingSteps()}
                    currentStep={state.loadingStep}
                    onAspect={setAr}
                  />
                </Match>

                <Match when={state.view === "result"}>
                  <ResultView
                    phone={phone()}
                    ar={ar()}
                    modelName={getModelName()}
                    results={getDoneResults()}
                    current={getCurrentResult()}
                    pending={pending()}
                    showLoading={pending() && !looking() && !state.showOriginal}
                    loadingSteps={getLoadingSteps()}
                    loadingStep={state.loadingStep}
                    showOriginal={state.showOriginal}
                    limitReached={isLimitReached()}
                    allDone={allDone()}
                    debugData={state.debugData}
                    onSelect={(id) => {
                      setLooking(true);
                      actions.select(id);
                    }}
                    onNext={selectNext}
                    onToggleOriginal={actions.toggleOriginal}
                    onFullscreen={() => actions.toggleFullscreen(true)}
                    onMore={() => (allDone() ? actions.clearFile() : actions.setView("upload"))}
                    onQuote={actions.showQuote}
                    onAspect={setAr}
                  />
                </Match>

                <Match when={state.view === "quote"}>
                  <QuoteView
                    brandName={getBrandName()}
                    vehicle={vehicle()}
                    results={getDoneResults()}
                    current={getCurrentResult()}
                    photo={state.previewDataUrl}
                    interested={state.interested}
                    lead={state.lead}
                    onBack={() => actions.setView(state.quoteBack)}
                    onFocus={actions.focusInterest}
                    onToggleInterest={actions.toggleInterest}
                    onLead={(lead) => actions.setLead(lead)}
                    onSubmit={quoteSubmit}
                  />
                </Match>
              </Switch>

              <Show when={state.notice}>
                <Overlay>
                  <NoticeCard kind={state.notice!} onClose={closeNotice} onAction={handleNoticeAction} />
                </Overlay>
              </Show>

              <Show when={!state.notice && state.popup === "sent"}>
                <Overlay>
                  <SentCard brandName={getBrandName()} onClose={() => actions.setPopup(null)} />
                </Overlay>
              </Show>

              <Show when={!state.notice && state.popup === "leave"}>
                <Overlay onOutside={() => actions.setPopup(null)}>
                  <LeaveCard
                    email={state.lead.email}
                    onEmail={(email) => actions.setLead({ email })}
                    onStay={() => actions.setPopup(null)}
                    onLeave={closeAll}
                    onSend={emailRenders}
                  />
                </Overlay>
              </Show>

              <Show when={!state.notice && state.popup === "emailed"}>
                <Overlay>
                  <EmailedCard email={state.lead.email} onDone={closeAll} />
                </Overlay>
              </Show>

              <Show when={state.showFullscreen}>
                <div class="xw-fsv" onClick={() => actions.toggleFullscreen(false)}>
                  <img src={(state.showOriginal ? getCurrentResult()?.photo : getCurrentResult()?.image) || ""} alt="" />
                  <button class="xw-ib" aria-label="Close full screen">
                    <IconX />
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
