/**
 * The phone as a kart controller, laid out for thumbs in either orientation.
 *
 * Left thumb steers: a floating stick that appears wherever the thumb lands
 * (or tilt, or two big arrows). Right thumb has a cluster on its natural arc:
 * DRIFT, the one held most, sits under the resting thumb; ITEM is up and in
 * from it; BRAKE is smaller and further away. The kart accelerates on its own
 * unless that is turned off. Input lives in refs and goes out on a fixed
 * beat, so touches never wait on React.
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
/** No steering inside this share of the travel, so a resting thumb drives straight. */
const DEAD_ZONE = 0.06;
/** Tilt for full lock, in radians (about 30 degrees). */
const TILT_LOCK = 0.52;

/** Keep a finger's events coming to this element. Some browsers throw for a finger that has already lifted. */
function capture(e: React.PointerEvent) {
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* the finger is gone; its pointerup has already been or will not be needed */
  }
}

/** Steering response: gentle around the centre for small corrections, full lock at the end of the travel. */
function shape(v: number) {
  const a = Math.abs(v);
  if (a <= DEAD_ZONE) return 0;
  const t = Math.min(1, (a - DEAD_ZONE) / (1 - DEAD_ZONE));
  return Math.sign(v) * (0.55 * t + 0.45 * t * t);
}

export function Controller({ link, me, game, vip }: { link: PhoneLink; me: PlayerInfo; game: GameStatus; vip: boolean }) {
  // Tilt saved on a secure page cannot work on a plain-http one: start on the slide stick there.
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
  const [pressed, setPressed] = useState({ drift: false, item: false, brake: false, gas: false });
  const [steering, setSteering] = useState(false);
  const [arrowSide, setArrowSide] = useState(0);
  const [rollIcon, setRollIcon] = useState(0);
  const [tiltError, setTiltError] = useState<string | null>(null);
  const [centred, setCentred] = useState(false);

  const steer = useRef(0);
  const buttons = useRef(0);
  const items = useRef(0);
  const zoneRef = useRef<HTMLElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  /** The floating stick: which finger, and where its centre is now. */
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  /** Thumb travel for full lock, in pixels. */
  const range = useRef(64);
  const tiltNeutral = useRef<number | null>(null);
  const arrows = useRef(new Map<number, -1 | 1>());

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

  // Full lock is a short thumb slide: a share of the steering side, within what a thumb does comfortably.
  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const fit = () => {
      range.current = Math.max(48, Math.min(96, zone.clientWidth * 0.2)) / sens;
      stickRef.current?.style.setProperty('--range', `${range.current}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(zone);
    return () => ro.disconnect();
  }, [sens, mode]);

  /** Show the steering on the stick's knob. */
  const showSteer = useCallback((raw: number) => {
    const knob = knobRef.current;
    if (knob) knob.style.transform = `translateX(${Math.max(-1, Math.min(1, raw)) * range.current}px)`;
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
      // Holding DRIFT keeps the power on too, so a drift never needs a second thumb for the gas.
      if ((autoGas && !document.hidden) || b & BTN.drift) b |= BTN.gas;
      if (b & BTN.brake) b &= ~BTN.gas;
      const key = `${s}|${b}|${items.current}`;
      const now = performance.now();
      if (key !== last || now - lastAt > HEARTBEAT_MS) {
        link.input(s, b, items.current);
        last = key;
        lastAt = now;
      }
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
      const raw = Math.max(-1, Math.min(1, (d / TILT_LOCK) * sens * (invertTilt ? -1 : 1)));
      steer.current = shape(raw);
      showSteer(raw);
    };
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      steer.current = 0;
      showSteer(0);
    };
  }, [mode, sens, invertTilt, showSteer]);

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

  /** A hold-to-act button: on while its finger is down, wherever that finger wanders. */
  const hold = (what: 'drift' | 'brake' | 'gas') => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      capture(e);
      press(what, true);
    },
    onPointerUp: () => press(what, false),
    onPointerCancel: () => press(what, false),
    onLostPointerCapture: () => press(what, false),
  });

  // ---- the steering side

  const zonePoint = (e: React.PointerEvent) => {
    const r = zoneRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const placeStick = (x: number, y: number) => {
    const el = stickRef.current;
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  };
  const endStick = () => {
    stick.current = null;
    steer.current = 0;
    setSteering(false);
    showSteer(0);
    const el = stickRef.current;
    if (el) el.style.left = el.style.top = '';
  };

  const onZoneDown = (e: React.PointerEvent) => {
    tryFullscreen();
    if (mode === 'tilt') {
      // A tap on the steering side makes the phone's current angle straight ahead.
      tiltNeutral.current = null;
      setCentred(true);
      window.setTimeout(() => setCentred(false), 900);
      buzz('tick');
      return;
    }
    if (mode !== 'touch' || stick.current) return;
    capture(e);
    const p = zonePoint(e);
    stick.current = { id: e.pointerId, ...p };
    placeStick(p.x, p.y);
    setSteering(true);
  };
  const onZoneMove = (e: React.PointerEvent) => {
    const s = stick.current;
    if (mode !== 'touch' || !s || s.id !== e.pointerId) return;
    const p = zonePoint(e);
    const R = range.current;
    let dx = p.x - s.x;
    // Past full lock the stick follows the thumb, so turning back answers at once instead of after the slack.
    if (Math.abs(dx) > R) {
      s.x = p.x - Math.sign(dx) * R;
      dx = Math.sign(dx) * R;
      placeStick(s.x, s.y);
    }
    steer.current = shape(dx / R);
    showSteer(dx / R);
  };
  const onZoneUp = (e: React.PointerEvent) => {
    if (stick.current?.id === e.pointerId) endStick();
  };

  // Arrows: one surface split down the middle, so a thumb can slide from one side to the other without lifting.
  const arrowAt = (e: React.PointerEvent): -1 | 1 => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? -1 : 1;
  };
  const syncArrows = () => {
    let sum = 0;
    for (const v of arrows.current.values()) sum += v;
    const side = Math.sign(sum);
    steer.current = side;
    setArrowSide((prev) => {
      if (prev !== side && side !== 0) buzz('tick');
      return side;
    });
  };
  const arrowHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      tryFullscreen();
      capture(e);
      arrows.current.set(e.pointerId, arrowAt(e));
      syncArrows();
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!arrows.current.has(e.pointerId)) return;
      const side = arrowAt(e);
      if (arrows.current.get(e.pointerId) === side) return;
      arrows.current.set(e.pointerId, side);
      syncArrows();
    },
    onPointerUp: (e: React.PointerEvent) => {
      arrows.current.delete(e.pointerId);
      syncArrows();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      arrows.current.delete(e.pointerId);
      syncArrows();
    },
  };

  /** Switch steering. False if tilt could not be turned on (the reason is shown in the controls sheet). */
  const chooseMode = async (m: SteerMode): Promise<boolean> => {
    setTiltError(null);
    if (m === 'tilt') {
      const Ctor = (window as unknown as { DeviceMotionEvent?: OrientationEventCtor }).DeviceMotionEvent;
      const fail = (why: string) => (setTiltError(why), false);
      if (!Ctor) return fail('This phone has no tilt sensor.');
      // Browsers only report motion to secure pages: on plain http tilt would silently do nothing.
      if (!window.isSecureContext) return fail('Tilt needs a secure (https) address. Use Slide or Arrows here.');
      if (typeof Ctor.requestPermission === 'function') {
        try {
          const res = await Ctor.requestPermission();
          if (res !== 'granted') return fail('Tilt was not allowed. Check your browser settings.');
        } catch {
          return fail('Tilt needs a secure (https) address on this phone.');
        }
      }
    }
    endStick();
    arrows.current.clear();
    setArrowSide(0);
    setMode(m);
    setTiltAsleep(false);
    prefs.set('steer', m);
    return true;
  };

  const charge = hud?.charge ?? 0;
  const itemIcon = hud?.rolling ? ITEM_ICONS[ROULETTE_ORDER[rollIcon]] : hud?.item ? ITEM_ICONS[hud.item] : '';
  const holding = !!hud?.item && !hud.rolling;
  const stunned = hud?.stunned;
  const finished = hud?.finished;
  const countdown = hud?.stage === 'countdown' || game.phase === 'intro';

  const status =
    hud && !countdown ? (
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
    );

  return (
    <main
      className={`pad pad--${mode}${stunned ? ' is-stunned' : ''}${finished ? ' is-finished' : ''}${autoGas ? '' : ' has-gas'}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <header className="pad__bar">
        <span className="tag">{PLAYER_LABELS[me.slot]}</span>
        <div className="pad__status">{status}</div>
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

      {/* Portrait only: the race at a glance, above the thumbs. */}
      <section className="pad__dash" aria-hidden>
        <div className="pad__status pad__status--big">{status}</div>
        <div className="pad__held">{holding ? itemById(hud!.item!)?.name : ' '}</div>
        <div className={`pad__meter charge-${charge}`}>
          <i />
          <i />
          <i />
        </div>
      </section>

      {hud?.wrongWay && <div className="pad__banner pad__banner--warn">Wrong way!</div>}
      {finished && (
        <div className="pad__finish">
          <b>{ordinal(hud!.place)}</b>
          <span>Finished! Watch the TV.</span>
        </div>
      )}

      <section
        className={`pad__steer${steering ? ' is-steering' : ''}`}
        ref={zoneRef}
        onPointerDown={onZoneDown}
        onPointerMove={onZoneMove}
        onPointerUp={onZoneUp}
        onPointerCancel={onZoneUp}
        onLostPointerCapture={onZoneUp}
      >
        {mode === 'buttons' ? (
          <div className="arrows" {...arrowHandlers}>
            <span className={arrowSide < 0 ? 'is-down' : ''} aria-label="Steer left">
              ◀
            </span>
            <span className={arrowSide > 0 ? 'is-down' : ''} aria-label="Steer right">
              ▶
            </span>
          </div>
        ) : (
          <>
            <div className="stick" ref={stickRef}>
              <div className="stick__track">
                <i />
              </div>
              <div className="stick__knob" ref={knobRef} />
            </div>
            {tiltAsleep ? (
              <button
                className="btn btn--go pad__wake"
                // Kept from the steering side, which would take the tap as recentring.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => void chooseMode('tilt').then((ok) => ok || void chooseMode('touch'))}
              >
                Tap to turn on tilt
              </button>
            ) : (
              <p className="pad__hint">
                {mode === 'tilt' ? (centred ? 'Centred' : 'Tilt to steer · tap here to centre') : 'Thumb down anywhere here, slide to steer'}
              </p>
            )}
          </>
        )}
      </section>

      <section className="pad__act">
        <button
          className={`pad-btn pad-btn--item${pressed.item ? ' is-down' : ''}${hud?.rolling ? ' is-rolling' : ''}${holding ? ' is-full' : ''}`}
          onPointerDown={(e) => (e.preventDefault(), useItem())}
          aria-label={holding ? `Use ${itemById(hud!.item!)?.name}` : 'Use item'}
        >
          <i dangerouslySetInnerHTML={{ __html: itemIcon }} />
          {hud && hud.count > 1 && !hud.rolling && <em>×{hud.count}</em>}
          {!itemIcon && <span>ITEM</span>}
        </button>
        <button className={`pad-btn pad-btn--drift charge-${charge}${pressed.drift ? ' is-down' : ''}`} {...hold('drift')} aria-label="Drift (hold)">
          <span>DRIFT</span>
          <small>{countdown ? 'tap on GO' : 'hold'}</small>
        </button>
        <button className={`pad-btn pad-btn--brake${pressed.brake ? ' is-down' : ''}`} {...hold('brake')} aria-label="Brake and reverse">
          <span>BRAKE</span>
          {holding && <small>+ ITEM throws back</small>}
        </button>
        {!autoGas && (
          <button className={`pad-btn pad-btn--gas${pressed.gas ? ' is-down' : ''}`} {...hold('gas')} aria-label="Accelerate">
            GAS
          </button>
        )}
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
                    {m === 'touch' ? 'Slide' : m === 'tilt' ? 'Tilt' : 'Arrows'}
                  </button>
                ))}
              </div>
            </div>
            {tiltError && <p className="notice">{tiltError}</p>}
            {mode === 'tilt' && (
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
            )}
            {mode !== 'buttons' && (
              <label className="field">
                <span>Sensitivity: {sens < 0.95 ? 'calm' : sens > 1.05 ? 'quick' : 'normal'}</span>
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
            )}
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
            <p className="dim sheet__tip">Drifting: hold DRIFT and steer into the bend to tighten it, out of it to widen it. Let go for a boost.</p>
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
/** Full screen on the first touch, where the browser allows it. Either way up works, so the orientation is left free. */
function tryFullscreen() {
  if (askedFullscreen) return;
  askedFullscreen = true;
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
}
