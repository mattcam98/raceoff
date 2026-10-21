/**
 * The phone as a kart controller. Left thumb steers (drag, tilt or two
 * buttons), right thumb has DRIFT, ITEM and BRAKE; the kart accelerates on
 * its own unless you turn that off. Input lives in refs and goes out on a
 * fixed beat, so touches never wait on React.
 */
import { BTN, itemById, PLAYER_LABELS, type GameStatus, type Hud, type PlayerInfo } from '@raceoff/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhoneLink } from '../lib/net';
import { prefs } from '../lib/storage';
import { ITEM_ICONS, ROULETTE_ORDER, ordinal, suffix } from '../ui/art';
import { buzz, canVibrate, hapticsOn, setHaptics } from './haptics';

type SteerMode = 'touch' | 'tilt' | 'buttons';

interface OrientationEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/** iPhones ask permission for motion on every page load, and only from a tap. */
const motionNeedsTap = () =>
  typeof (window as unknown as { DeviceMotionEvent?: OrientationEventCtor }).DeviceMotionEvent?.requestPermission === 'function';

const SEND_MS = 33;
const HEARTBEAT_MS = 120;

export function Controller({ link, me, game, vip }: { link: PhoneLink; me: PlayerInfo; game: GameStatus; vip: boolean }) {
  // Tilt saved on a secure page cannot work on a plain-http one: start on drag there.
  const [mode, setMode] = useState<SteerMode>(() => {
    const saved = prefs.get<SteerMode>('steer', 'touch');
    return saved === 'tilt' && !window.isSecureContext ? 'touch' : saved;
  });
  const [tiltAsleep, setTiltAsleep] = useState(() => mode === 'tilt' && motionNeedsTap());
  const [autoGas, setAutoGas] = useState<boolean>(() => prefs.get('autoGas', true));
  const [sens, setSens] = useState<number>(() => prefs.get('sens', 1));
  const [invertTilt, setInvertTilt] = useState<boolean>(() => prefs.get('invertTilt', false));
  const [menu, setMenu] = useState(false);
  const [hud, setHud] = useState<Hud | null>(link.latestHud);
  const [pressed, setPressed] = useState({ drift: false, item: false, brake: false, gas: false, left: false, right: false });
  const [rollIcon, setRollIcon] = useState(0);
  const [tiltError, setTiltError] = useState<string | null>(null);

  const steer = useRef(0);
  const buttons = useRef(0);
  const items = useRef(0);
  const wheelRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const touchOrigin = useRef<{ id: number; x: number } | null>(null);
  const tiltNeutral = useRef<number | null>(null);
  const dirKeys = useRef({ left: false, right: false });

  useEffect(() => {
    link.onHud = (h) => setHud(h);
    return () => {
      link.onHud = () => {};
    };
  }, [link]);

  // A new race starts with a clean dashboard, not the last race's place and item.
  useEffect(() => {
    if (game.phase === 'intro') setHud(null);
  }, [game.phase, game.raceIndex]);

  // Keep the screen awake while driving.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () => nav.wakeLock?.request('screen').then((l) => (lock = l), () => undefined);
    void get();
    const onVis = () => document.visibilityState === 'visible' && void get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // The steady stream of inputs to the TV.
  useEffect(() => {
    let last = '';
    let lastAt = 0;
    const t = window.setInterval(() => {
      // In the background (another app, the screen off) the browser still runs this about once a second: send
      // hands-off, so the kart coasts instead of driving on with the last steer and the gas held.
      if (document.hidden) {
        steer.current = 0;
        buttons.current = 0;
      }
      const s = Math.round(Math.max(-1, Math.min(1, steer.current)) * 100);
      let b = buttons.current;
      if (autoGas && !document.hidden && !(b & BTN.brake)) b |= BTN.gas;
      const key = `${s}|${b}|${items.current}`;
      const now = performance.now();
      if (key !== last || now - lastAt > HEARTBEAT_MS) {
        link.input(s, b, items.current);
        last = key;
        lastAt = now;
      }
      if (wheelRef.current) wheelRef.current.style.transform = `rotate(${s * 0.9}deg)`;
    }, SEND_MS);
    return () => window.clearInterval(t);
  }, [link, autoGas]);

  // Item roulette on the phone too.
  useEffect(() => {
    if (!hud?.rolling) return;
    const t = window.setInterval(() => setRollIcon((i) => (i + 1) % ROULETTE_ORDER.length), 80);
    return () => window.clearInterval(t);
  }, [hud?.rolling]);

  // Tilt steering: hold the phone like a wheel. Gravity, turned into screen coordinates, gives the wheel's
  // angle whichever way up the phone is; the angle when tilt was switched on (or recentred) is straight ahead.
  useEffect(() => {
    if (mode !== 'tilt') return;
    tiltNeutral.current = null;
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null) return;
      const deg = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
      const t = (deg * Math.PI) / 180;
      const sx = g.x * Math.cos(t) + g.y * Math.sin(t);
      const sy = -g.x * Math.sin(t) + g.y * Math.cos(t);
      const angle = Math.atan2(sx, -sy);
      if (tiltNeutral.current === null) tiltNeutral.current = angle;
      let d = angle - tiltNeutral.current;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      // About 30 degrees of turn is full lock.
      steer.current = Math.max(-1, Math.min(1, (d / 0.52) * sens * (invertTilt ? -1 : 1)));
    };
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      steer.current = 0;
    };
  }, [mode, sens, invertTilt]);

  const setBit = (bit: number, on: boolean) => {
    buttons.current = on ? buttons.current | bit : buttons.current & ~bit;
  };

  const press = useCallback((what: 'drift' | 'brake' | 'gas', on: boolean) => {
    setBit(what === 'drift' ? BTN.drift : what === 'brake' ? BTN.brake : BTN.gas, on);
    if (what === 'brake') setBit(BTN.back, on);
    setPressed((p) => (p[what] === on ? p : { ...p, [what]: on }));
    if (on) buzz('tick');
  }, []);

  const useItem = () => {
    items.current++;
    setPressed((p) => ({ ...p, item: true }));
    window.setTimeout(() => setPressed((p) => ({ ...p, item: false })), 120);
    buzz('tick');
  };

  // Drag steering: the finger's distance from where it first touched sets the angle.
  const onZoneDown = (e: React.PointerEvent) => {
    tryFullscreen();
    if (mode !== 'touch') return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    touchOrigin.current = { id: e.pointerId, x: e.clientX };
  };
  const onZoneMove = (e: React.PointerEvent) => {
    const o = touchOrigin.current;
    if (mode !== 'touch' || !o || o.id !== e.pointerId) return;
    const w = zoneRef.current?.clientWidth ?? 300;
    const range = Math.max(50, w * 0.22) / sens;
    steer.current = Math.max(-1, Math.min(1, (e.clientX - o.x) / range));
  };
  const onZoneUp = (e: React.PointerEvent) => {
    const o = touchOrigin.current;
    if (!o || o.id !== e.pointerId) return;
    touchOrigin.current = null;
    steer.current = 0;
  };
  const dir = (side: 'left' | 'right', on: boolean) => {
    dirKeys.current[side] = on;
    steer.current = (dirKeys.current.right ? 1 : 0) - (dirKeys.current.left ? 1 : 0);
    setPressed((p) => ({ ...p, [side]: on }));
    if (on) buzz('tick');
  };

  /** Switch steering. False if tilt could not be turned on (the reason is shown in the controls sheet). */
  const chooseMode = async (m: SteerMode): Promise<boolean> => {
    setTiltError(null);
    if (m === 'tilt') {
      const Ctor = (window as unknown as { DeviceMotionEvent?: OrientationEventCtor }).DeviceMotionEvent;
      const fail = (why: string) => (setTiltError(why), false);
      if (!Ctor) return fail('This phone has no tilt sensor.');
      // Browsers only report motion to secure pages: on plain http tilt would silently do nothing.
      if (!window.isSecureContext) return fail('Tilt needs a secure (https) address. Use Drag or Buttons here.');
      if (typeof Ctor.requestPermission === 'function') {
        try {
          const res = await Ctor.requestPermission();
          if (res !== 'granted') return fail('Tilt was not allowed. Check your browser settings.');
        } catch {
          return fail('Tilt needs a secure (https) address on this phone.');
        }
      }
    }
    steer.current = 0;
    setMode(m);
    setTiltAsleep(false);
    prefs.set('steer', m);
    return true;
  };

  const charge = hud?.charge ?? 0;
  const itemIcon = hud?.rolling ? ITEM_ICONS[ROULETTE_ORDER[rollIcon]] : hud?.item ? ITEM_ICONS[hud.item] : '';
  const stunned = hud?.stunned;
  const finished = hud?.finished;
  const countdown = hud?.stage === 'countdown' || game.phase === 'intro';

  return (
    <main className={`pad${stunned ? ' is-stunned' : ''}${finished ? ' is-finished' : ''}`} onContextMenu={(e) => e.preventDefault()}>
      <header className="pad__bar">
        <span className="tag">{PLAYER_LABELS[me.slot]}</span>
        {hud && !countdown ? (
          <>
            <span className="pad__place">
              <b>{hud.place}</b>
              <sup>{suffix(hud.place)}</sup>
              <small>/{hud.racers}</small>
            </span>
            <span className="pad__lap">
              Lap <b>{hud.lap}</b>/{hud.laps}
            </span>
          </>
        ) : (
          <span className="pad__lap">{game.phase === 'intro' ? 'Get ready…' : 'Tap DRIFT on GO for a rocket start!'}</span>
        )}
        <span className="pad__spacer" />
        {vip && (
          <button className="icon-btn" aria-label="Pause" onClick={() => link.command('pause')}>
            ⏸
          </button>
        )}
        <button className="icon-btn" aria-label="Controls" onClick={() => setMenu(true)}>
          ⚙
        </button>
      </header>

      {hud?.wrongWay && <div className="pad__banner pad__banner--warn">Wrong way!</div>}
      {finished && (
        <div className="pad__finish">
          <b>{ordinal(hud!.place)}</b>
          <span>Finished! Watch the TV.</span>
        </div>
      )}

      <section className="pad__left" ref={zoneRef} onPointerDown={onZoneDown} onPointerMove={onZoneMove} onPointerUp={onZoneUp} onPointerCancel={onZoneUp}>
        {mode === 'buttons' ? (
          <div className="dpad">
            <button className={pressed.left ? 'is-down' : ''} onPointerDown={() => dir('left', true)} onPointerUp={() => dir('left', false)} onPointerCancel={() => dir('left', false)} onPointerLeave={() => pressed.left && dir('left', false)} aria-label="Steer left">
              ◀
            </button>
            <button className={pressed.right ? 'is-down' : ''} onPointerDown={() => dir('right', true)} onPointerUp={() => dir('right', false)} onPointerCancel={() => dir('right', false)} onPointerLeave={() => pressed.right && dir('right', false)} aria-label="Steer right">
              ▶
            </button>
          </div>
        ) : (
          <div className="wheel-wrap">
            <div className="wheel" ref={wheelRef}>
              <svg viewBox="0 0 100 100" aria-hidden>
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="9" />
                <path d="M10 52 Q50 40 90 52 M50 52 V92" stroke="currentColor" strokeWidth="9" fill="none" strokeLinecap="round" />
                <circle cx="50" cy="52" r="9" fill="currentColor" />
              </svg>
            </div>
            {tiltAsleep ? (
              <button
                className="btn btn--go"
                // Kept from the steering zone, which would capture the pointer and swallow the click.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void chooseMode('tilt').then((ok) => ok || void chooseMode('touch'))}
              >
                Tap to turn on tilt
              </button>
            ) : (
              <p>{mode === 'tilt' ? 'Tilt to steer' : 'Drag left and right to steer'}</p>
            )}
          </div>
        )}
      </section>

      <section className="pad__right">
        <button
          className={`pad-btn pad-btn--item${pressed.item ? ' is-down' : ''}${hud?.rolling ? ' is-rolling' : ''}${hud?.item ? ' is-full' : ''}`}
          onPointerDown={(e) => (e.preventDefault(), useItem())}
          aria-label="Use item"
        >
          <i dangerouslySetInnerHTML={{ __html: itemIcon }} />
          {hud && hud.count > 1 && !hud.rolling && <em>×{hud.count}</em>}
          <span>{hud?.item && !hud.rolling ? itemById(hud.item)?.name : 'ITEM'}</span>
        </button>
        <button
          className={`pad-btn pad-btn--drift charge-${charge}${pressed.drift ? ' is-down' : ''}`}
          onPointerDown={(e) => ((e.currentTarget as HTMLElement).setPointerCapture(e.pointerId), press('drift', true))}
          onPointerUp={() => press('drift', false)}
          onPointerCancel={() => press('drift', false)}
          aria-label="Drift"
        >
          <span>DRIFT</span>
          <small>hold</small>
        </button>
        <div className="pad__small">
          <button
            className={`pad-btn pad-btn--brake${pressed.brake ? ' is-down' : ''}`}
            onPointerDown={(e) => ((e.currentTarget as HTMLElement).setPointerCapture(e.pointerId), press('brake', true))}
            onPointerUp={() => press('brake', false)}
            onPointerCancel={() => press('brake', false)}
            aria-label="Brake and reverse"
          >
            BRAKE
          </button>
          {!autoGas && (
            <button
              className={`pad-btn pad-btn--gas${pressed.gas ? ' is-down' : ''}`}
              onPointerDown={(e) => ((e.currentTarget as HTMLElement).setPointerCapture(e.pointerId), press('gas', true))}
              onPointerUp={() => press('gas', false)}
              onPointerCancel={() => press('gas', false)}
              aria-label="Accelerate"
            >
              GAS
            </button>
          )}
        </div>
      </section>

      {game.paused && (
        <div className="sheet">
          <div className="sheet__card">
            <h2>Paused</h2>
            {vip ? (
              <>
                <button className="btn btn--go btn--big" onClick={() => link.command('resume')}>
                  Resume
                </button>
                <button className="btn" onClick={() => link.command('again')}>
                  Restart race
                </button>
                <button className="btn btn--ghost" onClick={() => link.command('lobby')}>
                  Quit to lobby
                </button>
              </>
            ) : (
              <p>Waiting for the host to resume.</p>
            )}
          </div>
        </div>
      )}

      {menu && (
        <div className="sheet" onClick={() => setMenu(false)}>
          <div className="sheet__card" onClick={(e) => e.stopPropagation()}>
            <h2>Controls</h2>
            <div className="field" role="group" aria-label="Steering">
              <span>Steering</span>
              <div className="seg">
                {(['touch', 'tilt', 'buttons'] as SteerMode[]).map((m) => (
                  <button key={m} className={mode === m ? 'is-on' : ''} onClick={() => void chooseMode(m)}>
                    {m === 'touch' ? 'Drag' : m === 'tilt' ? 'Tilt' : 'Buttons'}
                  </button>
                ))}
              </div>
            </div>
            {tiltError && <p className="notice">{tiltError}</p>}
            {mode === 'tilt' && (
              <div className="tilt-row">
                <button className="btn btn--tiny" onClick={() => (tiltNeutral.current = null)}>
                  Recentre
                </button>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={invertTilt}
                    onChange={(e) => {
                      setInvertTilt(e.target.checked);
                      prefs.set('invertTilt', e.target.checked);
                    }}
                  />
                  <span>Turns the wrong way? Flip it</span>
                </label>
              </div>
            )}
            <label className="field">
              <span>Sensitivity</span>
              <input
                type="range"
                min={0.6}
                max={1.6}
                step={0.1}
                value={sens}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSens(v);
                  prefs.set('sens', v);
                }}
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoGas}
                onChange={(e) => {
                  setAutoGas(e.target.checked);
                  prefs.set('autoGas', e.target.checked);
                }}
              />
              <span>Accelerate automatically</span>
            </label>
            {canVibrate() && <VibrationToggle />}
            <button className="btn btn--go" onClick={() => setMenu(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function VibrationToggle() {
  const [on, setOn] = useState(hapticsOn());
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked);
          setHaptics(e.target.checked);
        }}
      />
      <span>Vibrate</span>
    </label>
  );
}

let askedFullscreen = false;
function tryFullscreen() {
  if (askedFullscreen) return;
  askedFullscreen = true;
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' })
    .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
    .catch(() => undefined);
}
