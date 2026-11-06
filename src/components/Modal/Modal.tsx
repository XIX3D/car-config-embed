import { Show, Switch, Match, createEffect, createSignal, on, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";
import type { WidgetStore, Lead } from "../../stores/widget-store";
import type { ApiClient } from "../../utils/api";
import type { Product, ProblemKind, RenderProblem, Variant } from "../../types";
import { debugWarn } from "../../utils/debug";
import { ModalHeader } from "./ModalHeader";
import { UploadView } from "./UploadView";
import { LoadingView } from "./LoadingView";
import { ResultView } from "./ResultView";
import { QuoteView } from "./QuoteView";
import { EmailGateView } from "./EmailGateView";
import { EmailedCard, LeaveCard, NoticeCard, Overlay, SentCard, type NoticeAction } from "./Popups";
import { FullView } from "./FullView";

interface ModalProps {
  store: WidgetStore;
  api: ApiClient;
  shadowRoot: ShadowRoot;
  /** Opens the same preview again, for "Session ended" (E7). */
  onReload?: () => void;
}

/** The CD's E4: after about 90 seconds the visitor may keep waiting or try again. */
const TAKING_LONG_MS = 90_000;

/** One finish of one wheel: what a render slot is for. */
interface Item {
  product: Product;
  variant: Variant;
}

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

  /** One per render in flight, so closing, "Try again" and a dead photo can cancel them. */
  const controllers = new Map<number, AbortController>();
  /** The finish each slot is rendering, for "Try again". */
  const slotItem = new Map<number, Item>();
  /** Finishes whose render failed, waiting for "Try again". */
  let failedItems: Item[] = [];
  let slowTimer = 0;
  let slowSlot = 0;

  const productImgUrl = () =>
    state.account?.icon_url || state.account?.logo_url
    // a dealer's mark is the dealer's, never whichever wheel is picked
    || (state.catalogue ? "" : state.product?.reference_image_paths?.[0]) || "";
  /** The account that pays and receives: the picked wheel's own on a brand's code, the dealer's on a dealer's. */
  const ownerId = () => state.manufacturerId ?? state.product?.manufacturer_id ?? 0;
  /** A dealer's picker needs a photo before it shows; a brand's code has its one wheel already. */
  const accent = () => (state.account?.accent_color && /^#[0-9a-f]{3,8}$/i.test(state.account.accent_color) ? state.account.accent_color : undefined);
  const sortedVariants = () =>
    [...(state.variants || [])].sort(
      (a, b) => (a.display_order ?? Number.MAX_SAFE_INTEGER) - (b.display_order ?? Number.MAX_SAFE_INTEGER),
    );
  const variantById = (id: string) => state.variants.find((v) => v.id === id);
  /** Finishes rendered, or rendering, on the photo on screen. */
  const doneVariantIds = () =>
    state.galleryResults
      // On a dealer's code the same photo can carry several wheels: a finish counts as done for ITS wheel only.
      .filter((r) => r.photoKey === state.photoKey && (r.success || r.loading) && r.variantId
        && (!state.catalogue || r.productId === state.product?.id))
      .map((r) => r.variantId!);
  /** On a dealer's code: the finishes rendered, or rendering, on this photo, wheel by wheel. */
  const doneByProduct = () => {
    const done: Record<string, string[]> = {};

    for (const r of state.galleryResults) {
      if (r.photoKey === state.photoKey && (r.success || r.loading) && r.variantId && r.productId) {
        (done[r.productId] ??= []).push(r.variantId);
      }
    }

    return done;
  };
  /** Every finish has a finished render on this photo: More finishes becomes New photo. A dealer's visitor can always pick another wheel. */
  const allDone = () =>
    !state.catalogue && sortedVariants().every((v) =>
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
    slotItem.delete(id);
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

  const productsFor = (variantId: string, productId?: string) => {
    const products: Array<{ product_id: string; variant_id?: string }> = [];
    const sel = state.selections;

    // A dealer's code: every render names its own wheel.
    if (productId) return [{ product_id: productId, variant_id: variantId }];

    if (sel?.wrap_id) products.push({ product_id: sel.wrap_id, variant_id: variantId });
    if (sel?.wheel_id) products.push({ product_id: sel.wheel_id, variant_id: variantId });

    return products;
  };

  const handleProblem = (id: number, problem: RenderProblem) => {
    const item = slotItem.get(id);

    debugWarn(`render ended without an image: ${problem.kind}${problem.code ? ` (${problem.code})` : ""}`);
    actions.dropSlot(id);
    settle(id);

    if (problem.kind === "limit") {
      const limit = problem.limit ?? state.visitorLimit;

      if (limit != null) actions.setVisitorUsage({ limit, used: problem.used ?? limit });
    }

    if (problem.kind === "fail") {
      if (item && !failedItems.some((f) => f.variant.id === item.variant.id && f.product.id === item.product.id)) failedItems = [...failedItems, item];
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

  /**
   * Run one render. Returns when it is over. `onMask` fires the moment its mask is known (or the
   * render ends without one): the batch's first render is the leader, and the others wait for it
   * so they find the mask already made (the studio's rule: one mask per photo, not one per finish).
   */
  const runSlot = (id: number, file: File, item: Item, first: boolean, productId?: string, onMask?: () => void) => {
    const variantId = item.variant.id;
    const ctrl = new AbortController();

    controllers.set(id, ctrl);
    slotItem.set(id, item);
    if (first) watchSlow(id);

    return props.api
      .renderStream(
        file,
        productsFor(variantId, productId),
        ownerId(),
        {
          onStarted: () => watchSlow(id),
          onVehicleDetected: (data) => actions.setDetectedVehicle(data),
          // Two-pass stage events drive the animation's step from real progress.
          onMaskStarted: (data) => {
            actions.setMaskCached(data.cached);
            actions.syncLoadingStage("mask");
          },
          onMaskComplete: (data) => {
            actions.setMaskCached(data.cached);
            // The server's cut-out of the wheels on this photo: they light up while the render runs.
            if (typeof data.cutout_png_b64 === "string" && data.cutout_png_b64.length > 64) {
              actions.setCutout(`data:image/png;base64,${data.cutout_png_b64}`);
            }
            onMask?.();
          },
          onFillStarted: () => actions.syncLoadingStage("fill"),
          onCompositeComplete: () => actions.syncLoadingStage("composite"),
          onDebug: (data) => actions.setDebugData(data),
          onComplete: (data) => {
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
          onProblem: (problem) => handleProblem(id, problem),
        },
        ctrl.signal,
      )
      .finally(() => {
        if (controllers.get(id) === ctrl) settle(id);
        onMask?.();
      });
  };

  /** Renders that may run at once once the leader has made the mask. */
  const PARALLEL = 3;

  /** Render these finishes (each of its wheel) on the photo on screen: the first leads, the rest follow its mask. */
  const startBatch = (items: Item[]) => {
    const file = state.selectedFile;

    if (!file || items.length === 0) return;
    if (isLimitReached()) {
      actions.setNotice("limit");

      return;
    }

    failedItems = [];
    actions.startLoading(isV2LoadingEnabled());
    const ids = actions.addSlots(
      items.map(({ product, variant }) => ({
        label: variant.variant_name,
        variantId: variant.id,
        hexColor: variant.hex_color || null,
        // The picture a thumbnail shows: the finish, else the wheel.
        referenceImage: variant.reference_image_paths?.[0] || variant.reference_image || product.reference_image_paths?.[0] || product.orthographic_image || null,
        productId: product.id,
        productName: product.name,
        photo: state.previewDataUrl,
        photoKey: state.photoKey,
      })),
    );
    const dealer = !!state.catalogue;
    const productOf = (k: number) => (dealer ? items[k].product.id : undefined);
    let release!: () => void;
    const leaderDone = new Promise<void>((resolve) => {
      release = resolve;
    });
    const alive = (id: number) => state.galleryResults.some((r) => r.id === id && r.loading);
    const queue = ids.slice(1);
    const lane = async () => {
      let id = queue.shift();

      while (id !== undefined) {
        if (alive(id)) await runSlot(id, file, items[ids.indexOf(id)], false, productOf(ids.indexOf(id)));
        id = queue.shift();
      }
    };

    runSlot(ids[0], file, items[0], true, productOf(0), release);
    // Once the leader's mask is made, the others run a few at a time and find it cached.
    leaderDone.then(() => {
      for (let k = 0; k < PARALLEL; k++) lane();
    });
  };

  /** A brand's code: one wheel, its picked finishes. */
  const startRender = (variantIds: string[]) => {
    const product = state.product;

    if (!product) return;
    startBatch(variantIds.map(variantById).filter((v): v is Variant => !!v).map((variant) => ({ product, variant })));
  };

  const renderPicked = () => {
    const done = doneVariantIds();

    startRender(sortedVariants().filter((v) => state.selectedVariantIds.includes(v.id) && !done.includes(v.id)).map((v) => v.id));
  };

  /** A dealer's code: every picked finish of every picked wheel, minus what is already rendered on this photo. */
  const renderPicks = () => {
    const done = doneByProduct();
    const items = state.picks.flatMap((pick) =>
      pick.variants
        .filter((v) => pick.variantIds.includes(v.id) && !(done[pick.product.id] ?? []).includes(v.id))
        .map((variant) => ({ product: pick.product, variant })),
    );

    if (items.length === 0) return;
    actions.clearPicks();
    startBatch(items.slice(0, props.store.batchCap()));
  };

  const handleFileSelect = (file: File) => {
    const reader = new FileReader();

    reader.onload = (e) => actions.setFile(file, e.target?.result as string, state.catalogue ? undefined : sortedVariants()[0]?.id);
    reader.readAsDataURL(file);
    // A dealer's picker suggests wheels for THIS car, so the car is read now, not after the first render.
    if (state.catalogue) {
      const key = state.photoKey + 1;

      props.api.detectVehicle(file).then((v) => {
        if (v && state.photoKey === key && !state.detectedVehicle) actions.setDetectedVehicle(v);
      });
    }
  };

  /** After a notice closes: a loading screen with nothing left to wait for goes back to the photo. */
  const afterNotice = () => {
    if (state.view === "loading" && !pending()) actions.setView(getDoneResults().length ? "result" : "upload");
  };

  /** "Wheel not available": read the dealer's list again and go back to the picker with the photo kept. */
  const refreshCatalogue = async () => {
    const res = await props.api.fetchCatalogue();

    if (res.ok) actions.setCatalogue(res.catalogue);
    else if (res.status === 401) actions.setNotice("expired");
    else actions.setNotice("nolist");
    if (state.view !== "upload") actions.setView("upload");
  };

  const handleNoticeAction = (action: NoticeAction) => {
    const kind = state.notice;

    actions.setNotice(null);

    if (action === "quote") {
      actions.showQuote();
    } else if (action === "pick") {
      refreshCatalogue();
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
          const again = slotItem.get(slow.id);

          controllers.get(slow.id)?.abort();
          actions.dropSlot(slow.id);
          settle(slow.id);
          if (again) startBatch([again]);

          return;
        }
      }
      const again = failedItems;

      failedItems = [];
      if (again.length) startBatch(again);
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
    if (!ownerId()) throw new Error("No product");
    const picks = state.galleryResults.filter((r) => state.interested.includes(r.id) && r.image);
    // On a dealer's code each render may be a different wheel: the quote names every one of them.
    const productIds = [...new Set([
      ...picks.map((r) => r.productId),
      ...(state.catalogue ? [] : [state.selections?.wheel_id, state.selections?.wrap_id]),
    ])]
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
      manufacturer_id: ownerId(),
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
    if (!ownerId()) throw new Error("No product");
    const productIds = [state.selections?.wheel_id, state.selections?.wrap_id]
      .filter((id): id is string => !!id)
      .map((id) => parseInt(id, 10));
    const res = await props.api.submitLead({
      name: lead.name.trim(),
      email: lead.email.trim(),
      phone: lead.phone.trim() || undefined,
      product_ids: productIds,
      manufacturer_id: ownerId(),
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

  /** Left and right through the finished renders: swipe or the arrow keys. */
  const selectBy = (step: number) => {
    const done = getDoneResults();
    const i = done.findIndex((r) => r.id === state.currentId);

    if (done.length > 1) actions.select(done[(i + step + done.length) % done.length].id);
  };
  const selectNext = () => selectBy(1);
  const selectPrev = () => selectBy(-1);

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
        <div
          class={`xw ${phone() ? "ph" : ""}`}
          style={accent() ? { "--xw-accent": accent() } : undefined}
          onClick={(e) => e.target === e.currentTarget && outsideClick()}
        >
          <div class={`xw-sheet ${dimmed() ? "dim" : ""}`} role="dialog" aria-modal="true" aria-label={getModelName() ? `${getBrandName()} - ${getModelName()}` : getBrandName()}>
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
                    picker={
                      state.catalogue
                        ? {
                            catalogue: state.catalogue,
                            loading: state.catalogueLoading,
                            brandFilter: state.brandFilter,
                            search: state.search,
                            picks: state.picks,
                            autoPick: state.autoPick,
                            onAutoPick: actions.autoPickWheel,
                            doneByProduct: doneByProduct(),
                            car: state.detectedVehicle,
                            cap: props.store.batchCap(),
                            onBrand: actions.setBrandFilter,
                            onSearch: actions.setSearch,
                            onToggleWheel: actions.toggleWheel,
                            onToggleFinish: actions.toggleFinish,
                            onClear: actions.clearPicks,
                            onRender: renderPicks,
                          }
                        : undefined
                    }
                  />
                </Match>

                <Match when={state.view === "loading"}>
                  <LoadingView
                    phone={phone()}
                    ar={ar()}
                    previewDataUrl={state.previewDataUrl}
                    loadingSteps={getLoadingSteps()}
                    currentStep={state.loadingStep}
                    cutout={state.cutout && state.cutout.photoKey === state.photoKey ? state.cutout.url : null}
                    onAspect={setAr}
                  />
                </Match>

                <Match when={state.view === "result"}>
                  <ResultView
                    phone={phone()}
                    ar={ar()}
                    modelName={state.catalogue ? (getCurrentResult()?.productName ?? "") : getModelName()}
                    slots={state.galleryResults}
                    current={getCurrentResult()}
                    pending={pending()}
                    limitReached={isLimitReached()}
                    allDone={allDone()}
                    moreWheels={!!state.catalogue}
                    debugData={state.debugData}
                    onSelect={(id) => actions.select(id)}
                    onNext={selectNext}
                    onPrev={selectPrev}
                    onChangePhoto={actions.clearFile}
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
                <Overlay onOutside={closeNotice}>
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

            </div>
          </div>

          {/* Outside the window, so full screen is the whole page's, not the window's. */}
          <Show when={state.showFullscreen && getCurrentResult()}>
            <FullView
              src={getCurrentResult()?.image || ""}
              original={getCurrentResult()?.photo}
              onPrev={selectPrev}
              onNext={selectNext}
              onClose={() => actions.toggleFullscreen(false)}
            />
          </Show>
        </div>
      </Portal>
    </Show>
  );
}
