// Inline SVG icons (stroke icons, 24px grid, currentColor).
const svg = (body: string, extra = "") =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${extra}>${body}</svg>`;

export const ICONS = {
  play: svg(`<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>`),
  pause: svg(`<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none"/>`),
  prev: svg(`<path d="M15 18l-6-6 6-6"/>`),
  next: svg(`<path d="M9 18l6-6-6-6"/>`),
  restart: svg(`<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>`),
  voiceOn: svg(`<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>`),
  voiceOff: svg(`<path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>`),
  fullscreen: svg(`<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>`),
  check: svg(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  x: svg(`<path d="M6 6l12 12"/><path d="M18 6L6 18"/>`),
  eye: svg(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
  hand: svg(`<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M15 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-.8a6 6 0 0 1-4.6-2.2L4 14.6a1.6 1.6 0 0 1 2.4-2L9 15V8.5a1.5 1.5 0 0 1 3 0"/>`),
  award: svg(`<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>`),
  keyboard: svg(`<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>`),
  chevronDown: svg(`<path d="M6 9l6 6 6-6"/>`),
  info: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>`),
  lock: svg(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`),
  // Mouse pointer (filled, with white outline) — rendered at the cursor hotspot (top-left).
  cursor: `<svg viewBox="0 0 28 28" width="28" height="28" focusable="false"><path d="M5 2.8v19.6l5.1-4.9 3.3 7.6 3.6-1.6-3.3-7.4h7z" fill="#111827" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
};
