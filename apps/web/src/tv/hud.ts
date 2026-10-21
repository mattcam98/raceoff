/**
 * The heads-up display over the 3D view: a panel per player viewport with
 * place, lap, item and time, plus the countdown, a minimap and the running
 * order. Plain DOM written only when something changes, so it costs next to
 * nothing per frame.
 */
import { characterById, PLAYER_COLORS, PLAYER_LABELS } from '@raceoff/shared';
import { rightX, rightZ, type Race } from '@raceoff/game';
import type { ViewportRect } from '../game3d/view';
import { formatTime, ITEM_ICONS, portrait, ROULETTE_ORDER, suffix } from '../ui/art';

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

class Flag {
  private last: string | null = null;
  constructor(private node: HTMLElement) {}
  set(cls: string) {
    if (cls === this.last) return;
    this.last = cls;
    this.node.dataset.state = cls;
  }
}

interface Panel {
  kart: number;
  root: HTMLElement;
  place: Cell;
  placeSuffix: Cell;
  placeFlag: Flag;
  lap: Cell;
  item: Cell;
  itemFlag: Flag;
  count: Cell;
  time: Cell;
  banner: Cell;
  bannerFlag: Flag;
  bannerUntil: number;
  name: HTMLElement;
  drift: Flag;
  lastLap: number;
}

export class Hud {
  readonly root: HTMLElement;
  private panels: Panel[] = [];
  private countdown: Cell;
  private countFlag: Flag;
  private countUntil = 0;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private mapPath: Path2D | null = null;
  /** The track and start line, drawn once per track and size; each frame only adds the karts. */
  private mapBg: HTMLCanvasElement | null = null;
  private mapFit = { s: 1, ox: 0, oy: 0 };
  private ticker: HTMLElement;
  private tickerRows: { row: HTMLElement; name: Cell; pos: Cell; flag: Flag }[] = [];
  private closing: Cell;
  private race: Race | null = null;
  private lastRoll = 0;
  private rollIndex = 0;
  visible = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const cd = el('div', 'hud-count', this.root);
    this.countdown = new Cell(cd);
    this.countFlag = new Flag(cd);
    this.map = el('canvas', 'hud-map', this.root);
    this.mapCtx = this.map.getContext('2d')!;
    this.ticker = el('div', 'hud-ticker', this.root);
    this.closing = new Cell(el('div', 'hud-closing', this.root));
    this.setVisible(false);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.root.style.display = v ? '' : 'none';
  }

  setRace(race: Race) {
    this.race = race;
    this.buildMap(race);
    this.ticker.innerHTML = '';
    this.tickerRows = race.karts.map(() => {
      const row = el('div', 'hud-tick', this.ticker);
      const pos = new Cell(el('b', '', row));
      const face = el('i', '', row);
      const name = new Cell(el('span', '', row));
      void face;
      return { row, name, pos, flag: new Flag(row) };
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
    for (const t of targets) {
      const k = race.karts[t.kart];
      const root = el('div', `hud-panel${shared ? ' is-corner' : ''}${rects.length > 2 ? ' is-small' : ''}`, this.root);
      if (t.rect) {
        Object.assign(root.style, { left: `${t.rect.x}px`, top: `${t.rect.y}px`, width: `${t.rect.w}px`, height: `${t.rect.h}px` });
        // Where the panel sits decides which corners stay clear for the minimap in the middle.
        const left = t.rect.x < 1;
        const top = t.rect.y < 1;
        root.dataset.pos = rects.length === 1 ? 'full' : rects.length === 2 ? (left ? 'left' : 'right') : `${top ? 't' : 'b'}${left ? 'l' : 'r'}`;
      } else {
        root.dataset.corner = String(k.slot);
      }
      root.style.setProperty('--pc', PLAYER_COLORS[k.slot] ?? '#fff');
      const top = el('div', 'hud-top', root);
      const lap = new Cell(el('div', 'hud-lap', top), true);
      const itemBox = el('div', 'hud-item', top);
      const item = new Cell(el('div', 'hud-item__icon', itemBox), true);
      const count = new Cell(el('span', 'hud-item__count', itemBox));
      const time = new Cell(el('div', 'hud-time', root));
      const placeEl = el('div', 'hud-place', root);
      const place = new Cell(el('b', '', placeEl));
      const placeSuffix = new Cell(el('sup', '', placeEl));
      const bannerEl = el('div', 'hud-banner', root);
      const name = el('div', 'hud-name', root);
      name.innerHTML = `<span>${PLAYER_LABELS[k.slot] ?? ''}</span>${escapeHtml(k.name)}`;
      const driftEl = el('div', 'hud-drift', root);
      this.panels.push({
        kart: t.kart, root, place, placeSuffix, placeFlag: new Flag(placeEl), lap, item, itemFlag: new Flag(itemBox), count, time,
        banner: new Cell(bannerEl), bannerFlag: new Flag(bannerEl), bannerUntil: 0, name, drift: new Flag(driftEl), lastLap: 1,
      });
    }
    // The minimap sits where the viewports meet.
    // From the viewports, not the DOM: the HUD is laid out while still hidden during the intro.
    const W = Math.max(1, ...rects.map((r) => r.x + r.w));
    const H = Math.max(1, ...rects.map((r) => r.y + r.h));
    const size = Math.round(Math.min(W, H) * (rects.length >= 3 ? 0.26 : 0.24));
    this.map.width = size * devicePixelRatio;
    this.map.height = size * devicePixelRatio;
    this.map.style.width = `${size}px`;
    this.map.style.height = `${size}px`;
    let mx = 24;
    let my = H - size - 24;
    if (rects.length >= 3 && !shared) {
      mx = W / 2 - size / 2;
      my = H / 2 - size / 2;
      if (rects.length === 4 && rects[3].kart === -1) {
        mx = rects[3].x + rects[3].w / 2 - size / 2;
        my = rects[3].y + rects[3].h / 2 - size / 2;
      }
    } else if (rects.length === 2) {
      mx = W / 2 - size / 2;
      my = H - size - 18;
    } else if (shared) {
      mx = W - size - 24;
      my = H - size - 24;
    }
    Object.assign(this.map.style, { left: `${mx}px`, top: `${my}px` });
    this.fitMap(size);
    this.ticker.dataset.hidden = rects.length > 2 && !shared ? '1' : '0';
  }

  private buildMap(race: Race) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of race.track.paths) for (const s of p.samples) {
      minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x);
      minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z);
    }
    this.mapBounds = { minX, maxX, minZ, maxZ };
  }
  private mapBounds = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

  private fitMap(size: number) {
    const race = this.race!;
    const b = this.mapBounds;
    const pad = 14;
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
      b.strokeStyle = 'rgba(15, 12, 40, 0.75)';
      b.lineWidth = 11;
      b.stroke(this.mapPath);
      b.strokeStyle = '#f4f2ff';
      b.lineWidth = 5;
      b.stroke(this.mapPath);
      // Start line.
      const st = race.track.pointAt(0, 0);
      b.strokeStyle = '#1b1740';
      b.lineWidth = 3;
      b.beginPath();
      b.moveTo((st.x - rightX(st.h) * 9) * s + ox, (st.z - rightZ(st.h) * 9) * s + oy);
      b.lineTo((st.x + rightX(st.h) * 9) * s + ox, (st.z + rightZ(st.h) * 9) * s + oy);
      b.stroke();
      this.mapBg = bg;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.map.width, this.map.height);
    g.drawImage(this.mapBg, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Computers first, humans on top.
    const order = [...race.karts].sort((a, b) => Number(!a.cpu) - Number(!b.cpu) || b.place - a.place);
    for (const k of order) {
      const x = k.x * s + ox;
      const y = k.z * s + oy;
      g.beginPath();
      if (k.cpu) {
        g.fillStyle = characterById(k.character).color;
        g.arc(x, y, 3.6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#1b1740';
        g.lineWidth = 1.5;
        g.stroke();
      } else {
        g.fillStyle = PLAYER_COLORS[k.slot] ?? '#fff';
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#fff';
        g.lineWidth = 2.5;
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

  /** Show a big countdown number or word for a moment. */
  count(text: string, ms = 900) {
    this.countdown.set(text);
    this.countFlag.set(text === 'GO!' ? 'go' : 'n');
    this.countUntil = performance.now() + ms;
    this.countdown.node.classList.remove('pop');
    void this.countdown.node.offsetWidth;
    this.countdown.node.classList.add('pop');
  }

  /** A banner over one player's view: FINAL LAP, a record, the finish. */
  banner(kart: number, text: string, kind = 'info', ms = 1800) {
    for (const p of this.panels) {
      if (p.kart !== kart) continue;
      p.banner.set(text);
      p.bannerFlag.set(kind);
      p.bannerUntil = performance.now() + ms;
      p.banner.node.classList.remove('pop');
      void p.banner.node.offsetWidth;
      p.banner.node.classList.add('pop');
    }
  }

  update() {
    const race = this.race;
    if (!race || !this.visible) return;
    const now = performance.now();
    if (now > this.countUntil) this.countFlag.set('hidden');
    if (now - this.lastRoll > 70) {
      this.lastRoll = now;
      this.rollIndex = (this.rollIndex + 1) % ROULETTE_ORDER.length;
    }
    for (const p of this.panels) {
      const k = race.karts[p.kart];
      p.place.set(String(k.place));
      p.placeSuffix.set(suffix(k.place));
      p.placeFlag.set(k.place <= 3 ? `p${k.place}` : 'pn');
      const lap = race.lapOf(k);
      p.lap.set(k.finished ? '<small>FINISHED</small>' : `<small>LAP</small> <b>${lap}</b><small>/${race.laps}</small>`);
      if (k.rollT > 0) {
        p.item.set(ITEM_ICONS[ROULETTE_ORDER[(this.rollIndex + k.index) % ROULETTE_ORDER.length]]);
        p.itemFlag.set('rolling');
        p.count.set('');
      } else if (k.item) {
        p.item.set(ITEM_ICONS[k.item] ?? '');
        p.itemFlag.set('full');
        p.count.set(k.itemCount > 1 ? `×${k.itemCount}` : '');
      } else {
        p.item.set('');
        p.itemFlag.set('empty');
        p.count.set('');
      }
      const t = k.finished ? (k.finishTime ?? 0) : Math.max(0, race.time);
      p.time.set(formatTime(t * 1000));
      if (now > p.bannerUntil) {
        if (k.wrongWayT > 1 && !k.finished) {
          p.banner.set('WRONG WAY!');
          p.bannerFlag.set('warn');
        } else p.bannerFlag.set('hidden');
      }
      p.drift.set(k.driftDir ? `l${k.driftLevel}` : 'off');
    }
    // Running order.
    if (this.ticker.dataset.hidden !== '1') {
      const order = [...race.karts].sort((a, b) => a.place - b.place);
      order.forEach((k, i) => {
        const r = this.tickerRows[i];
        if (!r) return;
        r.pos.set(String(k.place));
        r.name.set(k.name);
        r.flag.set(k.cpu ? 'cpu' : `p${k.slot}`);
        const face = r.row.children[1] as HTMLElement;
        if (face.dataset.ch !== k.character) {
          face.dataset.ch = k.character;
          face.innerHTML = portrait(k.character);
        }
      });
    }
    const closing = race.closingIn;
    this.closing.set(closing !== null && closing < 30 ? `Race ends in ${Math.ceil(closing)}` : '');
    this.drawMap();
  }
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
