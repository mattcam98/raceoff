/**
 * Flat SVG art for the screens: item icons and character portraits. Plain
 * strings, so the TV's HUD (plain DOM, updated every frame) and the React
 * screens can both use them.
 */
import { characterById } from '@raceoff/shared';

const svg = (body: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

const OUT = 'stroke="#1b1740" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"';
/** Item icons share one look: a 6-unit ink outline, flat bright fills and a white gloss at the top left. */
const INK = 'stroke="#1b1740" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"';
const GLOSS = (x: number, y: number, rx = 9, ry = 6, rot = -30) =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity=".75"/>`;
const bolt = (x: number, y: number, k = 1) =>
  `<path d="M${x + 4 * k} ${y - 14 * k} L${x - 7 * k} ${y + 2 * k} H${x} L${x - 4 * k} ${y + 14 * k} L${x + 7 * k} ${y - 2 * k} H${x} Z" fill="#ffd23f" stroke="#1b1740" stroke-width="${3 * k}" stroke-linejoin="round"/>`;
const ballAt = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#3ddc84" ${INK}/><path d="M${x - r * 0.8} ${y - r * 0.25} Q${x} ${y + r * 0.35} ${x + r * 0.8} ${y - r * 0.25}" fill="none" stroke="#fff" stroke-width="${r * 0.2}" stroke-linecap="round"/>${GLOSS(x - r * 0.38, y - r * 0.5, r * 0.26, r * 0.16)}`;
const canAt = (x: number, y: number, w: number, h: number) =>
  `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w * 0.28}" fill="#ff4d2e" ${INK}/><rect x="${x - w * 0.22}" y="${y - h / 2 - 9}" width="${w * 0.44}" height="10" rx="3" fill="#b8bfcc" ${INK}/>${bolt(x, y + 2, w / 44)}<path d="M${x - w * 0.28} ${y - h * 0.3} V${y - h * 0.05}" stroke="#fff" stroke-width="${w * 0.12}" stroke-linecap="round" opacity=".7"/>`;
/** A star of `r` around 50,52. */
const star = (r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    pts.push(`${(50 + Math.cos(a) * rr).toFixed(1)} ${(53 + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
};

export const ITEM_ICONS: Record<string, string> = {
  ball: svg(ballAt(50, 52, 36)),
  ball3: svg(`${ballAt(29, 64, 20)}${ballAt(71, 64, 20)}${ballAt(50, 30, 20)}`),
  seeker: svg(`<ellipse cx="34" cy="28" rx="15" ry="11" transform="rotate(-20 34 28)" fill="#dff6ff" ${INK}/><ellipse cx="62" cy="24" rx="15" ry="11" transform="rotate(15 62 24)" fill="#dff6ff" ${INK}/><path d="M18 60 L6 64" ${INK}/><ellipse cx="50" cy="58" rx="32" ry="25" fill="#ffd23f" ${INK}/><path d="M38 36 Q34 58 38 81 M55 34 Q51 58 55 82" fill="none" stroke="#1b1740" stroke-width="9"/><circle cx="73" cy="53" r="5.5" fill="#1b1740"/>${GLOSS(70, 44, 6, 4, 20)}`),
  oil: svg(`<path d="M50 12 C64 34 79 47 79 64 A29 29 0 0 1 21 64 C21 47 36 34 50 12Z" fill="#2b2840" ${INK}/><path d="M35 60 Q38 74 52 76" stroke="#9b6bff" stroke-width="7" fill="none" stroke-linecap="round"/>${GLOSS(40, 42, 6, 9, 25)}`),
  bomb: svg(`<path d="M56 24 Q66 8 78 14" fill="none" ${INK}/><circle cx="46" cy="58" r="31" fill="#2b2840" ${INK}/><rect x="38" y="20" width="18" height="13" rx="3" fill="#b8bfcc" ${INK}/><path d="M82 6 l3 7 7 1 -6 4 2 7 -6 -4 -6 4 2 -7 -6 -4 7 -1z" fill="#ffd23f" stroke="#ff7a2e" stroke-width="2.5" stroke-linejoin="round"/>${GLOSS(34, 46, 9, 6)}`),
  plane: svg(`<path d="M8 54 L92 16 L60 88 L48 62 Z" fill="#ffffff" ${INK}/><path d="M48 62 L92 16" ${INK} fill="none"/><path d="M48 62 L40 80 L60 88" fill="#ff4d6d" ${INK}/>`),
  shield: svg(`<circle cx="50" cy="50" r="39" fill="#7fd8ff" fill-opacity=".6" ${INK}/><circle cx="50" cy="50" r="27" fill="none" stroke="#fff" stroke-width="3" opacity=".35"/><path d="M28 40 A24 24 0 0 1 50 22" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="68" cy="68" r="5" fill="#fff" opacity=".85"/>`),
  nitro: svg(canAt(50, 56, 44, 62)),
  nitro3: svg(`${canAt(22, 62, 26, 44)}${canAt(78, 62, 26, 44)}${canAt(50, 54, 28, 54)}`),
  sugar: svg(`<path d="${star(42)}" fill="#ff5fa2" ${INK}/><path d="${star(30)}" fill="#ffd23f"/><path d="${star(19)}" fill="#3ddc84"/><path d="${star(9)}" fill="#3d9bff"/><circle cx="42" cy="50" r="4" fill="#1b1740"/><circle cx="58" cy="50" r="4" fill="#1b1740"/>`),
  rocket: svg(`<path d="M36 60 L18 80 L37 77 Z M64 60 L82 80 L63 77 Z" fill="#ff4d6d" ${INK}/><path d="M40 77 Q50 100 60 77" fill="#ffb02e" ${INK}/><path d="M50 6 C71 22 73 52 64 77 H36 C27 52 29 22 50 6Z" fill="#f2f4f8" ${INK}/><circle cx="50" cy="40" r="9" fill="#3d9bff" ${INK}/>${GLOSS(40, 24, 5, 9, 20)}`),
};

export const ROULETTE_ORDER = ['ball', 'nitro', 'oil', 'seeker', 'shield', 'bomb', 'sugar', 'ball3', 'plane', 'nitro3', 'rocket'];

/**
 * The item roulette: every icon in a column, twice over, so sliding it up by half (a CSS animation, `.reel`)
 * loops without a seam and costs nothing per frame.
 */
export const ROULETTE_REEL = `<span class="reel">${[...ROULETTE_ORDER, ...ROULETTE_ORDER].map((id) => `<i>${ITEM_ICONS[id]}</i>`).join('')}</span>`;

/** The Giant's Hand, in the items' style: the hand itself and its three moves. */
export const GIANT_ICONS = {
  hand: svg(`<path d="M30 88 C18 74 12 60 14 52 C16 46 24 46 28 52 L34 62 V22 C34 15 44 15 44 22 V48 V14 C44 7 54 7 54 14 V48 V18 C54 11 64 11 64 18 V50 V28 C64 21 74 21 74 28 V62 C74 76 68 86 60 90 Z" fill="#ffd2b0" ${INK}/><path d="M44 48 V40 M54 48 V40 M64 50 V42" stroke="#e8a27a" stroke-width="4" stroke-linecap="round"/>`),
  butter: svg(`<path d="M12 62 L50 44 L88 58 L88 70 L50 88 L12 74 Z" fill="#ffe27a" ${INK}/><path d="M12 62 L50 76 L88 58 M50 76 V88" fill="none" ${INK}/><path d="M24 62 L50 52" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/><path d="M28 40 L72 22" stroke="#9aa0ab" stroke-width="8" stroke-linecap="round"/><path d="M28 40 L72 22" stroke="#e8ebf2" stroke-width="3" stroke-linecap="round"/>`),
  bomb: svg(`<circle cx="50" cy="52" r="36" fill="#ff5fa2" ${INK}/><path d="M22 40 Q50 30 78 40 M18 58 Q50 48 82 58 M24 74 Q50 66 76 74" fill="none" stroke="#ffd23f" stroke-width="7"/>${GLOSS(36, 32, 9, 6)}`),
  flick: svg(`<path d="M18 70 C14 60 20 50 30 50 H58 C66 50 66 40 58 40 H40 C30 40 30 28 40 28 H76 C86 28 90 38 88 50 L84 70 C82 80 74 86 64 86 H34 C26 86 20 80 18 70 Z" fill="#ffd2b0" ${INK}/><path d="M90 16 L98 10 M92 30 L100 28 M84 6 L86 0" stroke="#ffd23f" stroke-width="5" stroke-linecap="round"/>`),
} as const;

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
