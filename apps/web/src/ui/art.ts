/**
 * Flat SVG art for the screens: item icons and character portraits. Plain
 * strings, so the TV's HUD (plain DOM, updated every frame) and the React
 * screens can both use them.
 */
import { characterById } from '@raceoff/shared';

const svg = (body: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

const OUT = 'stroke="#1b1740" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';

export const ITEM_ICONS: Record<string, string> = {
  ball: svg(`<circle cx="50" cy="52" r="36" fill="#3ddc84" ${OUT}/><path d="M18 40 Q50 58 82 40 M22 68 Q50 50 78 68" fill="none" stroke="#fff" stroke-width="8"/><circle cx="38" cy="34" r="7" fill="#fff" opacity=".7"/>`),
  ball3: svg(`<g ${OUT}><circle cx="30" cy="62" r="20" fill="#3ddc84"/><circle cx="70" cy="62" r="20" fill="#3ddc84"/><circle cx="50" cy="30" r="20" fill="#3ddc84"/></g><g fill="#fff" opacity=".75"><circle cx="24" cy="56" r="5"/><circle cx="64" cy="56" r="5"/><circle cx="44" cy="24" r="5"/></g>`),
  seeker: svg(`<ellipse cx="50" cy="58" rx="30" ry="24" fill="#ffd23f" ${OUT}/><path d="M38 36 V80 M54 34 V82" stroke="#1b1740" stroke-width="9"/><ellipse cx="34" cy="26" rx="16" ry="11" fill="#dff6ff" ${OUT}/><ellipse cx="64" cy="24" rx="16" ry="11" fill="#dff6ff" ${OUT}/><circle cx="74" cy="54" r="5" fill="#1b1740"/><path d="M20 62 L8 66" ${OUT}/>`),
  oil: svg(`<path d="M50 14 C64 36 78 48 78 64 A28 28 0 0 1 22 64 C22 48 36 36 50 14Z" fill="#232032" ${OUT}/><path d="M36 60 Q40 72 52 74" stroke="#8a7dff" stroke-width="6" fill="none" stroke-linecap="round"/>`),
  bomb: svg(`<circle cx="46" cy="58" r="30" fill="#2b2840" ${OUT}/><rect x="40" y="20" width="16" height="12" rx="3" fill="#9aa0ab" ${OUT}/><path d="M56 24 Q68 10 78 16" fill="none" ${OUT}/><circle cx="80" cy="14" r="8" fill="#ffd23f"/><circle cx="36" cy="48" r="7" fill="#fff" opacity=".5"/>`),
  plane: svg(`<path d="M10 54 L90 18 L58 86 L48 60 Z" fill="#ffffff" ${OUT}/><path d="M48 60 L90 18" ${OUT} fill="none"/><path d="M48 60 L40 78 L58 86" fill="#ff4d6d" ${OUT}/>`),
  shield: svg(`<circle cx="50" cy="50" r="38" fill="#7fd8ff" fill-opacity=".55" ${OUT}/><path d="M30 40 A22 22 0 0 1 52 22" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="66" cy="66" r="6" fill="#fff" opacity=".8"/>`),
  nitro: svg(`<rect x="28" y="22" width="44" height="64" rx="12" fill="#ff4d2e" ${OUT}/><rect x="40" y="10" width="20" height="14" rx="4" fill="#9aa0ab" ${OUT}/><path d="M54 36 L40 58 H52 L46 76 L62 52 H50 Z" fill="#ffd23f" stroke="#1b1740" stroke-width="3" stroke-linejoin="round"/>`),
  nitro3: svg(`<g ${OUT}><rect x="8" y="34" width="26" height="50" rx="8" fill="#ff4d2e"/><rect x="37" y="24" width="26" height="60" rx="8" fill="#ff4d2e"/><rect x="66" y="34" width="26" height="50" rx="8" fill="#ff4d2e"/></g><g fill="#ffd23f" stroke="#1b1740" stroke-width="2.5" stroke-linejoin="round"><path d="M24 44 L16 58 H22 L18 72 L28 56 H22 Z"/><path d="M53 36 L44 52 H51 L46 70 L58 50 H51 Z"/><path d="M82 44 L74 58 H80 L76 72 L86 56 H80 Z"/></g>`),
  sugar: svg(`<path d="M50 8 L61 36 L91 38 L67 56 L76 86 L50 69 L24 86 L33 56 L9 38 L39 36 Z" fill="url(#rb)" ${OUT}/><defs><linearGradient id="rb" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset=".4" stop-color="#ffd23f"/><stop offset=".7" stop-color="#3ddc84"/><stop offset="1" stop-color="#3d9bff"/></linearGradient></defs><circle cx="42" cy="46" r="4" fill="#1b1740"/><circle cx="58" cy="46" r="4" fill="#1b1740"/>`),
  rocket: svg(`<path d="M50 6 C70 22 72 52 64 74 H36 C28 52 30 22 50 6Z" fill="#f2f4f8" ${OUT}/><circle cx="50" cy="38" r="9" fill="#3d9bff" ${OUT}/><path d="M36 60 L20 78 L36 76 Z M64 60 L80 78 L64 76 Z" fill="#ff4d6d" ${OUT}/><path d="M40 76 Q50 98 60 76" fill="#ffb02e" ${OUT}/>`),
};

export const ROULETTE_ORDER = ['ball', 'nitro', 'oil', 'seeker', 'shield', 'bomb', 'sugar', 'ball3', 'plane', 'nitro3', 'rocket'];

// ---------------------------------------------------------------- portraits

const EYES = (y = 52, dx = 14, r = 6) =>
  `<g><circle cx="${50 - dx}" cy="${y}" r="${r + 3}" fill="#fff"/><circle cx="${50 + dx}" cy="${y}" r="${r + 3}" fill="#fff"/><circle cx="${50 - dx + 1}" cy="${y + 1}" r="${r - 1}" fill="#1b1740"/><circle cx="${50 + dx + 1}" cy="${y + 1}" r="${r - 1}" fill="#1b1740"/><circle cx="${50 - dx + 3}" cy="${y - 2}" r="2" fill="#fff"/><circle cx="${50 + dx + 3}" cy="${y - 2}" r="2" fill="#fff"/></g>`;

const FACES: Record<string, (c: string, a: string) => string> = {
  zip: (c, a) => `<path d="M18 34 L28 8 L42 30 Z M82 34 L72 8 L58 30 Z" fill="${c}" ${OUT}/><path d="M24 30 L29 16 L36 28 Z M76 30 L71 16 L64 28 Z" fill="${a}"/><circle cx="50" cy="56" r="34" fill="${c}" ${OUT}/><ellipse cx="50" cy="70" rx="20" ry="15" fill="${a}"/>${EYES(50)}<circle cx="50" cy="64" r="5" fill="#1b1740"/>`,
  bonk: (c, a) => `<circle cx="22" cy="28" r="12" fill="${c}" ${OUT}/><circle cx="78" cy="28" r="12" fill="${c}" ${OUT}/><circle cx="50" cy="56" r="36" fill="${c}" ${OUT}/><ellipse cx="50" cy="70" rx="17" ry="13" fill="${a}"/>${EYES(50, 15, 5)}<ellipse cx="50" cy="64" rx="6" ry="4.5" fill="#1b1740"/>`,
  volt: (c, a) => `<line x1="50" y1="20" x2="50" y2="6" ${OUT}/><circle cx="50" cy="6" r="5" fill="#ff4d6d"/><rect x="16" y="20" width="68" height="64" rx="12" fill="${c}" ${OUT}/><rect x="24" y="38" width="52" height="22" rx="8" fill="#101820"/><circle cx="38" cy="49" r="5" fill="#7df9ff"/><circle cx="62" cy="49" r="5" fill="#7df9ff"/><rect x="34" y="68" width="32" height="6" rx="3" fill="${a}"/><rect x="8" y="42" width="8" height="16" rx="3" fill="${a}" ${OUT}/><rect x="84" y="42" width="8" height="16" rx="3" fill="${a}" ${OUT}/>`,
  duckie: (c, a) => `<path d="M48 22 Q54 6 62 14" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="54" r="36" fill="${c}" ${OUT}/>${EYES(46, 15, 5)}<ellipse cx="50" cy="68" rx="20" ry="9" fill="${a}" ${OUT}/>`,
  mochi: (c, a) => `<path d="M16 40 L22 10 L42 26 Z M84 40 L78 10 L58 26 Z" fill="${c}" ${OUT}/><circle cx="50" cy="56" r="34" fill="${c}" ${OUT}/><ellipse cx="50" cy="68" rx="15" ry="10" fill="${a}"/>${EYES(50)}<path d="M46 63 L54 63 L50 67 Z" fill="#ff4d8d"/><path d="M12 62 H30 M12 70 H30 M70 62 H88 M70 70 H88" stroke="#fff" stroke-width="2.5"/>`,
  hopper: (c, a) => `<circle cx="30" cy="30" r="16" fill="${c}" ${OUT}/><circle cx="70" cy="30" r="16" fill="${c}" ${OUT}/><ellipse cx="50" cy="60" rx="40" ry="30" fill="${c}" ${OUT}/><circle cx="30" cy="30" r="9" fill="#fff"/><circle cx="70" cy="30" r="9" fill="#fff"/><circle cx="31" cy="31" r="5" fill="#1b1740"/><circle cx="71" cy="31" r="5" fill="#1b1740"/><path d="M28 64 Q50 80 72 64" fill="none" stroke="#1b4d1b" stroke-width="4" stroke-linecap="round"/><ellipse cx="50" cy="78" rx="18" ry="6" fill="${a}" opacity=".8"/>`,
  pebble: (c, a) => `<circle cx="50" cy="52" r="38" fill="${c}" ${OUT}/><ellipse cx="50" cy="60" rx="26" ry="27" fill="${a}"/>${EYES(48, 12, 5)}<path d="M42 62 L58 62 L50 72 Z" fill="#ff9f1c" ${OUT}/>`,
  ember: (c, a) => `<path d="M30 30 L24 6 L42 24 Z M70 30 L76 6 L58 24 Z" fill="${a}" ${OUT}/><circle cx="50" cy="54" r="34" fill="${c}" ${OUT}/><ellipse cx="50" cy="70" rx="22" ry="14" fill="${c}" ${OUT}/>${EYES(48)}<circle cx="43" cy="70" r="2.5" fill="#1b1740"/><circle cx="57" cy="70" r="2.5" fill="#1b1740"/>`,
};

export function portrait(id: string): string {
  const ch = characterById(id);
  const face = FACES[ch.id] ?? FACES.volt;
  return svg(face(ch.color, ch.accent));
}

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const suffix = (n: number) => ordinal(n).slice(String(n).length);

export function formatTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '--:--.--';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const cs = Math.floor((t % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
