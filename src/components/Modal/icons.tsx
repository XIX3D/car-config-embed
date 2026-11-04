/** The window's icons, drawn as the round 16 mock draws them. */
const stroke = { fill: 'none', stroke: 'currentColor', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const

export const IconX = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2.2"><path d="M6 6l12 12M18 6L6 18" /></svg>
)

export const IconBack = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2.4"><path d="M15 5l-7 7 7 7" /></svg>
)

export const IconCheck = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="3"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
)

export const IconSpark = () => (
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z" /></svg>
)

export const IconHeart = (props: { on: boolean }) => (
  <svg viewBox="0 0 24 24" {...stroke} fill={props.on ? 'currentColor' : 'none'} stroke-width="2">
    <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.5 8 3.4 4.8 6.6 4.8c1.9 0 3.4 1 5.4 3 2-2 3.5-3 5.4-3 3.2 0 5.1 3.2 3.9 6.4-1.8 4.7-9.3 9.3-9.3 9.3z" />
  </svg>
)

export const IconSwap = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2"><path d="M7 8h12l-3-3M17 16H5l3 3" /></svg>
)

export const IconFull = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
)

export const IconCamera = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="1.8">
    <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" /><circle cx="12" cy="13.2" r="3.6" />
  </svg>
)

export const IconClock = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)

export const IconPause = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2.4"><path d="M9 6v12M15 6v12" /></svg>
)

export const IconWarn = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2.2">
    <path d="M12 8v5M12 16.5v.5" /><path d="M10.3 3.9L2.5 17.5a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
)

export const IconPhoto = () => (
  <svg viewBox="0 0 24 24" {...stroke} stroke-width="2">
    <rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" />
  </svg>
)

/** The studio's upload orb glyph (RenderStudio). */
export const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5" /><path d="M5 18.5h14" />
  </svg>
)
