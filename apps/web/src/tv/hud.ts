/**
 * The heads-up display over the 3D view: a panel per player viewport with
 * item, lap, time and place, plus the countdown, a minimap, the running
 * order and the giants' feed. Plain DOM, written only when something
 * changes; motion is CSS or the Web Animations API (transforms and opacity
 * only), so a frame costs next to nothing and never forces a layout.
 */
import { characterById, PLAYER_COLORS, PLAYER_LABELS } from '@raceoff/shared';
import { rightX, rightZ, type Race } from '@raceoff/game';
import type { ViewportRect } from '../game3d/view';
import { formatTime, GIANT_ICONS, ITEM_ICONS, portrait, ROULETTE_REEL, suffix } from '../ui/art';
import { ICONS } from '../ui/icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Sets text or HTML only when it changed. */
class Cell {
  private last: string | null = null;
  constructor(
    readonly node: HTMLElement,
    private html = false,
  ) {}
  set(v: string) {
    if (v === this.last) return;
    this.last = v;
    if (this.html) this.node.innerHTML = v;
    else this.node.textContent = v;
  }
}

/** A `data-state` attribute, written only when it changed. */
class Flag {
  private last: string | null = null;
  constructor(readonly node: HTMLElement) {}
  set(cls: string) {
    if (cls === this.last) return;
    this.last = cls;
    this.node.dataset.state = cls;
  }
  get value() {
    return this.last;
  }
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** A one-off flourish. Skipped when the viewer has asked for less motion: the HUD reads the same without it. */
function flourish(node: HTMLElement, frames: Keyframe[], ms: number, easing = 'cubic-bezier(0.34, 1.56, 0.64, 1)') {
  if (reduced()) return;
  node.animate(frames, { duration: ms, easing });
}

const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

interface Panel {
  kart: number;
  root: HTMLElement;
  item: Flag;
  itemSlot: HTMLElement;
  itemIcon: Cell;
  count: Cell;
  lapBox: Flag;
  lapLabel: Cell;
  lapN: Cell;
  lapOf: Cell;
  time: Cell;
  split: Flag;
  splitText: Cell;
  splitUntil: number;
  lapsSeen: number;
  place: Flag;
  placeIn: HTMLElement;
  placeN: Cell;
  placeSuffix: Cell;
  lastPlace: number;
  banner: Flag;
  bannerText: Cell;
  bannerUntil: number;
  drift: Flag;
}

/** The racing order down the left: one row per kart, slid into its place, so an overtake glides. */
interface TowerRow {
  row: HTMLElement;
  pos: Cell;
  flag: Flag;
  y: number;
}

export class Hud {
  readonly root: HTMLElement;
  private panels: Panel[] = [];
  private countEl: HTMLElement;
  private countText: Cell;
  private countFlag: Flag;
  private countUntil = 0;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapPath: Path2D | null = null;
  /** The track and start line, drawn once per track and size; each frame only adds the karts. */
  private mapBg: HTMLCanvasElement | null = null;
  private mapFit = { s: 1, ox: 0, oy: 0 };
  private mapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  private tower: HTMLElement;
  private towerRows: TowerRow[] = [];
  private closing: Cell;
  private closingFlag: Flag;
  private feedEl: HTMLElement;
  private race: Race | null = null;
  /** Karts whose phone has dropped: their view says so until it is back (`setAway`). */
  private away = new Set<number>();
  visible = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    this.map = el('canvas', 'hud-map', this.root);
    this.mapCtx = this.map.getContext('2d')!;
    this.tower = el('div', 'hud-tower', this.root);
    const closing = el('div', 'hud-closing', this.root);
    el('i', 'hud-closing__icon', closing).innerHTML = ICONS.timer;
    this.closing = new Cell(el('span', '', closing));
    this.closingFlag = new Flag(closing);
    this.feedEl = el('div', 'hud-feed', this.root);
    this.countEl = el('div', 'hud-count', this.root);
    this.countText = new Cell(el('b', 'hud-count__n', this.countEl));
    this.countFlag = new Flag(this.countEl);
    this.countFlag.set('hidden');
    this.setVisible(false);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.root.hidden = !v;
  }

  /**
   * Mark a kart's phone as gone (or back). While away, that kart's view shows a "PHONE DISCONNECTED" sign over
   * every other banner, until this is called again with false or the kart finishes. Survives `layout`; cleared
   * by `setRace`.
   */
  setAway(kart: number, away: boolean) {
    if (away) this.away.add(kart);
    else this.away.delete(kart);
  }

  setRace(race: Race) {
    this.race = race;
    this.away.clear();
    this.feedEl.innerHTML = '';
    this.buildMap(race);
    this.tower.innerHTML = '';
    this.towerRows = race.karts.map((k) => {
      const row = el('div', 'hud-tick', this.tower);
      const pos = new Cell(el('b', 'hud-tick__pos', row));
      el('i', 'hud-tick__face', row).innerHTML = portrait(k.character);
      el('span', 'hud-tick__name', row).textContent = k.name;
      if (!k.cpu) row.style.setProperty('--pc', PLAYER_COLORS[k.slot] ?? '#fff');
      return { row, pos, flag: new Flag(row), y: -1 };
    });
  }

  layout(rects: ViewportRect[]) {
    for (const p of this.panels) p.root.remove();
    this.panels = [];
    const race = this.race;
    if (!race) return;
    const shared = rects.length === 1 && rects[0].kart === -1;
    const humans = race.karts.filter((k) => !k.cpu);
    const targets: { kart: number; rect: ViewportRect | null }[] = shared
      ? humans.map((k) => ({ kart: k.index, rect: null }))
      : rects.filter((r) => r.kart >= 0).map((r) => ({ kart: r.kart, rect: r }));
    // From the viewports, not the DOM: the HUD is laid out while still hidden during the intro.
    const W = Math.max(1, ...rects.map((r) => r.x + r.w));
    const H = Math.max(1, ...rects.map((r) => r.y + r.h));
    for (const t of targets) {
      const k = race.karts[t.kart];
      const root = el('div', `hud-panel${shared ? ' is-corner' : ''}`, this.root);
      if (t.rect) {
        Object.assign(root.style, { left: `${t.rect.x}px`, top: `${t.rect.y}px`, width: `${t.rect.w}px`, height: `${t.rect.h}px` });
        // Everything scales with the viewport's share of the screen, so a quarter is still readable from the sofa.
        const s = Math.max(0.6, Math.min(1, Math.sqrt((t.rect.w * t.rect.h) / (W * H)) * 1.25));
        root.style.setProperty('--s', s.toFixed(3));
        // Where the panel sits decides which corners stay clear for the minimap where the viewports meet.
        const left = t.rect.x < 1;
        const top = t.rect.y < 1;
        root.dataset.pos = rects.length === 1 ? 'full' : rects.length === 2 ? (left ? 'left' : 'right') : `${top ? 't' : 'b'}${left ? 'l' : 'r'}`;
      } else {
        root.dataset.corner = String(k.slot);
      }
      root.style.setProperty('--pc', PLAYER_COLORS[k.slot] ?? '#fff');

      const tl = el('div', 'hud-tl', root);
      const itemBox = el('div', 'hud-item', tl);
      const itemSlot = el('div', 'hud-item__slot', itemBox);
      const itemIcon = new Cell(el('div', 'hud-item__icon', itemSlot), true);
      el('div', 'hud-item__reel', itemSlot).innerHTML = ROULETTE_REEL;
      const count = new Cell(el('span', 'hud-item__count', itemBox));
      const lapEl = el('div', 'hud-lap', tl);
      const lapLabel = new Cell(el('small', 'hud-lap__label', lapEl));
      const lapNum = el('span', 'hud-lap__num', lapEl);
      const lapN = new Cell(el('b', '', lapNum));
      const lapOf = new Cell(el('small', '', lapNum));

      const tr = el('div', 'hud-tr', root);
      const time = new Cell(el('div', 'hud-time', tr));
      const splitEl = el('div', 'hud-split', tr);
      const splitText = new Cell(splitEl, true);

      const placeEl = el('div', 'hud-place', root);
      const placeIn = el('span', 'hud-place__in', placeEl);
      const placeN = new Cell(el('b', '', placeIn));
      const placeSuffix = new Cell(el('sup', '', placeIn));

      const bannerEl = el('div', 'hud-banner', root);
      el('i', 'hud-banner__icon', bannerEl).innerHTML = ICONS.uturn;
      const bannerText = new Cell(el('span', 'hud-banner__text', bannerEl));

      const name = el('div', 'hud-name', root);
      name.innerHTML = `<span>${PLAYER_LABELS[k.slot] ?? ''}</span>${escapeHtml(k.name)}`;
      const driftEl = el('div', 'hud-drift', root);
      el('i', '', driftEl);
      el('i', '', driftEl);
      el('i', '', driftEl);

      const panel: Panel = {
        kart: t.kart, root, item: new Flag(itemBox), itemSlot, itemIcon, count,
        lapBox: new Flag(lapEl), lapLabel, lapN, lapOf, time, split: new Flag(splitEl), splitText, splitUntil: 0, lapsSeen: k.lapTimes.length,
        place: new Flag(placeEl), placeIn, placeN, placeSuffix, lastPlace: k.place,
        banner: new Flag(bannerEl), bannerText, bannerUntil: 0, drift: new Flag(driftEl),
      };
      panel.banner.set('hidden');
      panel.split.set('hidden');
      this.panels.push(panel);
    }

    const size = Math.round(Math.min(W, H) * (rects.length >= 3 ? 0.27 : 0.25));
    this.map.width = size * devicePixelRatio;
    this.map.height = size * devicePixelRatio;
    this.map.style.width = `${size}px`;
    this.map.style.height = `${size}px`;
    let mx = 20;
    let my = H - size - 20;
    // With three players the fourth quarter is an overview, with room for the map and the running order.
    const spare = rects.length === 4 && rects[3].kart === -1 && !shared ? rects[3] : null;
    if (spare) {
      mx = spare.x + spare.w * 0.68 - size / 2;
      my = spare.y + spare.h / 2 - size / 2;
    } else if (rects.length >= 3 && !shared) {
      mx = W / 2 - size / 2;
      my = H / 2 - size / 2;
    } else if (rects.length === 2 || shared) {
      mx = W / 2 - size / 2;
      my = H - size - 14;
    }
    Object.assign(this.map.style, { left: `${mx}px`, top: `${my}px` });
    this.fitMap(size);
    // Four players leave no room for the order; three put it in the spare quarter, beside the map.
    this.tower.dataset.hidden = rects.length > 2 && !shared && !spare ? '1' : '0';
    this.tower.dataset.layout = shared ? 'shared' : spare ? 'spare' : rects.length === 2 ? 'split' : 'full';
    Object.assign(this.tower.style, spare ? { left: `${spare.x + spare.w * 0.06}px`, top: `${spare.y + spare.h / 2}px` } : { left: '', top: '' });
  }

  private buildMap(race: Race) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of race.track.paths) for (const s of p.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    this.mapBounds = { minX, maxX, minZ, maxZ };
  }

  private fitMap(size: number) {
    const race = this.race!;
    const b = this.mapBounds;
    const pad = 16;
    const s = Math.min((size - pad * 2) / (b.maxX - b.minX), (size - pad * 2) / (b.maxZ - b.minZ));
    this.mapFit = { s, ox: (size - (b.maxX - b.minX) * s) / 2 - b.minX * s, oy: (size - (b.maxZ - b.minZ) * s) / 2 - b.minZ * s };
    const path = new Path2D();
    for (const p of race.track.paths) {
      p.samples.forEach((smp, i) => {
        const x = smp.x * s + this.mapFit.ox;
        const y = smp.z * s + this.mapFit.oy;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      if (p.closed) path.closePath();
    }
    this.mapPath = path;
    this.mapBg = null;
  }

  private drawMap() {
    const race = this.race;
    if (!race || !this.mapPath) return;
    const g = this.mapCtx;
    const dpr = this.map.width / parseFloat(this.map.style.width || '1');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, ox, oy } = this.mapFit;
    if (!this.mapBg || this.mapBg.width !== this.map.width || this.mapBg.height !== this.map.height) {
      const bg = document.createElement('canvas');
      bg.width = this.map.width;
      bg.height = this.map.height;
      const b = bg.getContext('2d')!;
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.lineJoin = 'round';
      b.lineCap = 'round';
      // A raised toy road: dark rim, a lighter body, a soft inner line.
      b.strokeStyle = 'rgba(11, 14, 38, 0.85)';
      b.lineWidth = 13;
      b.stroke(this.mapPath);
      b.strokeStyle = '#e9e6ff';
      b.lineWidth = 7.5;
      b.stroke(this.mapPath);
      b.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      b.lineWidth = 2.5;
      b.stroke(this.mapPath);
      // Start line: a little chequered bar across the road.
      const st = race.track.pointAt(0, 0);
      const rx = rightX(st.h);
      const rz = rightZ(st.h);
      const fx = -rz;
      const fz = rx;
      for (let i = -3; i < 3; i++) {
        for (let j = 0; j < 2; j++) {
          b.fillStyle = (i + j) % 2 === 0 ? '#1b1740' : '#ffffff';
          const cx = st.x + rx * (i + 0.5) * 2.4 + fx * (j - 0.5) * 2.4;
          const cz = st.z + rz * (i + 0.5) * 2.4 + fz * (j - 0.5) * 2.4;
          b.beginPath();
          b.arc(cx * s + ox, cz * s + oy, 1.6, 0, Math.PI * 2);
          b.fill();
        }
      }
      this.mapBg = bg;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.drawImage(this.mapBg, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Computers first, humans on top, the leader of the computers marked.
    const order = [...race.karts].sort((a, b) => Number(!a.cpu) - Number(!b.cpu) || b.place - a.place);
    for (const k of order) {
      const x = k.x * s + ox;
      const y = k.z * s + oy;
      if (k.cpu) {
        g.beginPath();
        g.fillStyle = characterById(k.character).color;
        g.arc(x, y, 4, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = k.place === 1 ? '#ffc93c' : '#1b1740';
        g.lineWidth = k.place === 1 ? 2.4 : 1.6;
        g.stroke();
      } else {
        // A player: a pointer in their colour, nose along the kart's heading.
        const fx = Math.sin(k.h);
        const fz = Math.cos(k.h);
        g.beginPath();
        g.moveTo(x + fx * 11, y + fz * 11);
        g.lineTo(x - fz * 7.5 - fx * 3, y + fx * 7.5 - fz * 3);
        g.lineTo(x + fz * 7.5 - fx * 3, y - fx * 7.5 - fz * 3);
        g.closePath();
        g.lineJoin = 'round';
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.stroke();
        g.fill();
        g.beginPath();
        g.fillStyle = PLAYER_COLORS[k.slot] ?? '#fff';
        g.arc(x, y, 6.2, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2.6;
        g.stroke();
      }
    }
    for (const p of race.projectiles) {
      if (p.kind !== 'plane') continue;
      g.fillStyle = '#ff4d6d';
      g.beginPath();
      g.arc(p.x * s + ox, p.z * s + oy, 4, 0, Math.PI * 2);
      g.fill();
    }
  }

  /** Slam a countdown number (or GO!) onto the middle of the screen for a moment. */
  count(text: string, ms = 900) {
    const go = text === 'GO!';
    this.countText.set(text);
    this.countFlag.set(go ? 'go' : `n${text}`);
    this.countUntil = performance.now() + ms;
    flourish(
      this.countEl,
      go
        ? [{ transform: 'scale(0.3) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.18) rotate(3deg)', opacity: 1, offset: 0.35 }, { transform: 'scale(1)', opacity: 1, offset: 0.6 }, { transform: 'scale(1.5)', opacity: 0 }]
        : [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(0.92)', opacity: 1, offset: 0.28 }, { transform: 'scale(1)', opacity: 1, offset: 0.4 }, { transform: 'scale(1)', opacity: 1, offset: 0.8 }, { transform: 'scale(0.7)', opacity: 0 }],
      ms,
      'ease-out',
    );
  }

  /**
   * A line in the feed at the top of the screen: what the giants are up to. `html` must already be escaped;
   * `slot` colours it for the player it is about, `icon` names one of the giant's moves.
   */
  feed(html: string, slot = -1, icon?: keyof typeof GIANT_ICONS) {
    const row = el('div', 'hud-feed__row', this.feedEl);
    row.innerHTML = `${icon ? `<i class="hud-feed__icon">${GIANT_ICONS[icon]}</i>` : ''}<span>${html}</span>`;
    if (slot >= 0) row.style.setProperty('--pc', PLAYER_COLORS[slot]);
    while (this.feedEl.children.length > 3) this.feedEl.firstElementChild!.remove();
    window.setTimeout(() => row.classList.add('is-out'), 3400);
    window.setTimeout(() => row.remove(), 3900);
  }

  /**
   * A banner over one player's view. `kind` picks the look: 'final' (the FINAL LAP ribbon), 'finish' (the
   * place, huge), 'good' (a boost, a hit landed), 'warn' (a hazard sign) or 'info'.
   */
  banner(kart: number, text: string, kind = 'info', ms = 1800) {
    for (const p of this.panels) {
      if (p.kart !== kart) continue;
      p.bannerText.set(text);
      p.banner.set(kind);
      p.bannerUntil = performance.now() + ms;
      if (!text) continue;
      const out = Math.max(0.6, 1 - 260 / ms);
      const inAt = Math.min(0.4, 380 / ms);
      flourish(
        p.banner.node,
        kind === 'final'
          ? [{ transform: 'translateX(110%) skewX(-12deg)', opacity: 1 }, { transform: 'translateX(-4%) skewX(-12deg)', offset: inAt }, { transform: 'translateX(0) skewX(-12deg)', offset: inAt * 1.4 }, { transform: 'translateX(0) skewX(-12deg)', offset: out }, { transform: 'translateX(-110%) skewX(-12deg)' }]
          : [{ transform: 'scale(2.2)', opacity: 0 }, { transform: 'scale(0.94)', opacity: 1, offset: inAt * 0.7 }, { transform: 'scale(1)', opacity: 1, offset: inAt }, { transform: 'scale(1)', opacity: 1, offset: out }, { transform: 'scale(1.1)', opacity: 0 }],
        ms,
        'ease-out',
      );
      if (kind === 'final') this.punch(p.lapBox.node, 1.5);
    }
  }

  private punch(node: HTMLElement, by = 1.35) {
    flourish(node, [{ transform: `scale(${by})` }, { transform: 'scale(1)' }], 420, SPRING);
  }

  update() {
    const race = this.race;
    if (!race || !this.visible) return;
    const now = performance.now();
    if (now > this.countUntil) this.countFlag.set('hidden');
    for (const p of this.panels) {
      const k = race.karts[p.kart];

      // Place: a punch when it changes, green going up, red going down.
      p.placeN.set(String(k.place));
      p.placeSuffix.set(suffix(k.place));
      p.place.set(k.place <= 3 ? `p${k.place}` : 'pn');
      if (k.place !== p.lastPlace) {
        const up = k.place < p.lastPlace;
        p.lastPlace = k.place;
        // Green for a place gained, red for one lost, fading back to the place colour. Not motion, so not gated.
        p.placeIn.animate([{ color: up ? '#3ddc84' : '#ff5a4a' }, { color: up ? '#3ddc84' : '#ff5a4a', offset: 0.45 }], { duration: 1100, easing: 'ease-in' });
        flourish(p.placeIn, [{ transform: `scale(${up ? 1.45 : 0.75}) rotate(${up ? -6 : 4}deg)` }, { transform: 'scale(1) rotate(0)' }], 480, SPRING);
      }

      // Lap: the number punches as it turns over; the last lap glows red.
      const lap = race.lapOf(k);
      if (k.finished) {
        p.lapLabel.set('FINISH');
        p.lapN.set('');
        p.lapOf.set('');
        p.lapBox.set('done');
      } else {
        p.lapLabel.set('LAP');
        p.lapN.set(String(lap));
        p.lapOf.set(`/${race.laps}`);
        p.lapBox.set(lap === race.laps && race.laps > 1 ? 'final' : 'on');
      }
      if (k.lapTimes.length !== p.lapsSeen) {
        p.lapsSeen = k.lapTimes.length;
        const last = k.lapTimes[k.lapTimes.length - 1];
        if (last !== undefined) {
          const best = k.lapTimes.length > 1 && k.bestLap === last;
          p.splitText.set(`<small>${best ? 'BEST' : `LAP ${k.lapTimes.length}`}</small>${formatTime(last * 1000)}`);
          p.split.set(best ? 'best' : 'show');
          p.splitUntil = now + 4000;
          this.punch(p.lapBox.node);
        }
      } else if (now > p.splitUntil) p.split.set('hidden');

      // Item: a spinning reel while the roulette runs, then the prize slams in.
      const was = p.item.value;
      if (k.rollT > 0) {
        p.item.set('rolling');
        p.count.set('');
      } else if (k.item) {
        p.itemIcon.set(ITEM_ICONS[k.item] ?? '');
        p.item.set('full');
        p.count.set(k.itemCount > 1 ? `×${k.itemCount}` : '');
        if (was === 'rolling' || was === 'empty') {
          flourish(p.itemSlot, [{ transform: 'scale(1.4) rotate(-8deg)' }, { transform: 'scale(1) rotate(0)' }], 460, SPRING);
        }
      } else {
        p.item.set('empty');
        p.count.set('');
      }

      const t = k.finished ? (k.finishTime ?? 0) : Math.max(0, race.time);
      p.time.set(formatTime(t * 1000));
      if (this.away.has(p.kart) && !k.finished) {
        p.bannerText.set('PHONE DISCONNECTED');
        p.banner.set('warn');
      } else if (now > p.bannerUntil) {
        if (k.wrongWayT > 1 && !k.finished) {
          p.bannerText.set('WRONG WAY');
          p.banner.set('wrong');
        } else p.banner.set('hidden');
      }
      p.drift.set(k.driftDir ? `l${k.driftLevel}` : 'off');
    }

    // Running order: each row slides to its place.
    if (this.tower.dataset.hidden !== '1') {
      for (const k of race.karts) {
        const r = this.towerRows[k.index];
        if (!r) continue;
        r.pos.set(String(k.place));
        r.flag.set(`${k.cpu ? 'cpu' : 'human'}${k.place === 1 ? ' lead' : ''}${k.finished ? ' done' : ''}`);
        if (r.y !== k.place) {
          r.y = k.place;
          r.row.style.transform = `translateY(${(k.place - 1) * 100}%)`;
        }
      }
    }
    const closing = race.closingIn;
    this.closing.set(closing !== null && closing < 30 ? `Race ends in ${Math.ceil(closing)}` : '');
    this.closingFlag.set(closing !== null && closing < 30 ? (closing < 10 ? 'urgent' : 'on') : 'hidden');
    this.drawMap();
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
