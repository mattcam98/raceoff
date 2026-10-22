/**
 * Interface glyphs as inline SVG strings: sound, pause, settings and the like.
 * Emoji draw differently on every TV and phone (and as empty boxes on some),
 * so anything that matters is drawn here instead. They take the text colour,
 * so a glyph matches the label or button it sits in.
 */

const glyph = (body: string, fill = false) =>
  `<svg class="glyph" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  sound: glyph('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'),
  fullscreen: glyph('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  pause: glyph('<rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>'),
  gear: glyph('<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M19.23 9.65L21.98 9.87L21.98 14.13L19.23 14.35L18.77 15.44L20.56 17.55L17.55 20.56L15.44 18.77L14.35 19.23L14.13 21.98L9.87 21.98L9.65 19.23L8.56 18.77L6.45 20.56L3.44 17.55L5.23 15.44L4.77 14.35L2.02 14.13L2.02 9.87L4.77 9.65L5.23 8.56L3.44 6.45L6.45 3.44L8.56 5.23L9.65 4.77L9.87 2.02L14.13 2.02L14.35 4.77L15.44 5.23L17.55 3.44L20.56 6.45L18.77 8.56Z M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 1 0 0-6.8Z"/>'),
  close: glyph('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: glyph('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  plus: glyph('<path d="M12 5v14M5 12h14"/>'),
  timer: glyph('<circle cx="12" cy="13.5" r="7"/><path d="M12 9.5v4l2.5 2M10 2.8h4M18.5 6l1.5-1.5"/>'),
  skip: glyph('<path d="M5 6l8 6-8 6z" fill="currentColor"/><path d="M18 6v12"/>'),
  left: glyph('<path d="M15 5l-8 7 8 7z" fill="currentColor"/>'),
  right: glyph('<path d="M9 5l8 7-8 7z" fill="currentColor"/>'),
  /** Wrong way: a U-turn arrow. */
  uturn: glyph('<path d="M6.5 21V10.5a5.5 5.5 0 0 1 11 0V19"/><path d="M13.5 15.5L17.5 19.5L21.5 15.5"/>'),
  keyboard: glyph('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h1M10.5 10h1M14.5 10h1M8 14h8"/>'),
  trophy: `<svg class="glyph glyph--color" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v5a5 5 0 0 1-10 0z" fill="#ffc93c" stroke="#1b1740" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 5H4.2a3 3 0 0 0 3.3 4.5M17 5h2.8a3 3 0 0 1-3.3 4.5" fill="none" stroke="#1b1740" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 13.5h3l.6 3.5h-4.2z" fill="#d99a0a" stroke="#1b1740" stroke-width="1.6" stroke-linejoin="round"/><rect x="7.5" y="17" width="9" height="3.5" rx="1" fill="#ffc93c" stroke="#1b1740" stroke-width="1.8"/><path d="M9.5 5.5v2.5" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/></svg>`,
  /** A checkered flag. */
  flag: `<svg class="glyph glyph--color" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 3v18.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5.5 4h14v10h-14z" fill="#fff"/><g fill="#1b1740"><rect x="5.5" y="4" width="3.5" height="3.3"/><rect x="12.5" y="4" width="3.5" height="3.3"/><rect x="9" y="7.3" width="3.5" height="3.4"/><rect x="16" y="7.3" width="3.5" height="3.4"/><rect x="5.5" y="10.7" width="3.5" height="3.3"/><rect x="12.5" y="10.7" width="3.5" height="3.3"/></g></svg>`,
} as const;

export type IconName = keyof typeof ICONS;
