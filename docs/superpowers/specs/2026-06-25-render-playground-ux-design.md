# Render Playground UX Fixes — Design

Date: 2026-06-25
Scope: `docs/.vitepress/theme/components/RenderPlayground.vue` + `docs/.vitepress/theme/custom.css` only.

## Problems (from user)
1. Product selection is a cramped dropdown: 40px thumbnails, tiny text, a 320px scroll area for hundreds of products. Reopening search jumps to the top instead of the current product, and `pickProduct()` wipes the search text, forcing a re-type and re-find every time.
2. Vehicle image selection: acceptable, leave unchanged.
3. Render button lives in the top bar while prompt (step 3) and output (step 4) sit at the bottom, so the user scrolls up to render then down to view output.

## Approved approach
- **Product picker → full modal.** Step 1 shows a trigger button (current product image + name + SKU, or a placeholder). Clicking opens a teleported, centered overlay with a sticky search bar and a responsive grid of large cards (square image, name, SKU, external_id). The current product is highlighted and scrolled into view on open; the search box is auto-focused. Search text persists across opens so reopening keeps the filter. Click a card to pick and close; Esc or backdrop click closes.
- **Render → floating button + auto-scroll.** A fixed bottom-right Render FAB is always visible (mirrors the existing top-bar button's label/disabled logic). `triggerRender()` smooth-scrolls the Output section into view so results appear without manual scrolling. The top-bar button stays as-is.

## Implementation notes
- New refs: `productModalOpen`, `productSearchInput`, `productGrid`, `outputSection`. Remove now-dead `productListOpen` and `onClickOutside` (the dropdown they served is gone).
- `pickProduct()` no longer clears `productSearch`; closes the modal.
- Esc handling folded into existing `onFullscreenKeydown`.
- All new styles are `.rp-*` prefixed, reuse existing CSS variables and the `.rp-fullscreen-overlay` backdrop. No new dependencies, no API changes.

## Out of scope
Vehicle grid, prompt editor, output rendering, auth, and API behavior are untouched.
