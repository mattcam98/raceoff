/**
 * Keyboard players on the TV itself, for when phones are not handy (or for
 * testing). The first keyboard player drives with WASD, the second with the
 * arrow keys.
 */
import type { KartInput } from '@raceoff/game';

interface Scheme {
  left: string[];
  right: string[];
  gas: string[];
  brake: string[];
  drift: string[];
  item: string[];
}

export const SCHEMES: Scheme[] = [
  { left: ['KeyA'], right: ['KeyD'], gas: ['KeyW'], brake: ['KeyS'], drift: ['Space'], item: ['KeyE', 'KeyQ'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], gas: ['ArrowUp'], brake: ['ArrowDown'], drift: ['ShiftRight', 'Period'], item: ['Enter', 'Slash'] },
];

export const SCHEME_HELP = ['W A S D to drive · Space to drift · E for items', 'Arrows to drive · Right Shift to drift · Enter for items'];

export class KeyboardPads {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private players: string[] = [];

  private onDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (this.players.length && SCHEMES.some((s) => Object.values(s).some((keys: string[]) => keys.includes(e.code)))) e.preventDefault();
    if (!this.down.has(e.code)) this.pressed.add(e.code);
    this.down.add(e.code);
  };
  private onUp = (e: KeyboardEvent) => this.down.delete(e.code);
  private onBlur = () => this.down.clear();

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  setPlayers(ids: string[]) {
    this.players = ids;
  }

  /** The input for a keyboard player, or null if this player is not on the keyboard. */
  input(pid: string): KartInput | null {
    const i = this.players.indexOf(pid);
    if (i < 0 || i >= SCHEMES.length) return null;
    const s = SCHEMES[i];
    const held = (keys: string[]) => keys.some((k) => this.down.has(k));
    const item = s.item.some((k) => this.pressed.has(k));
    for (const k of s.item) this.pressed.delete(k);
    const steer = (held(s.right) ? 1 : 0) - (held(s.left) ? 1 : 0);
    const brake = held(s.brake);
    return { steer, gas: held(s.gas), brake, drift: held(s.drift), back: brake, item };
  }
}
