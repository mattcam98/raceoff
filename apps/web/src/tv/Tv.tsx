import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'wouter';
import { music, songFor } from '../audio/music';
import { audioReady, play, unlockAudio } from '../audio/sound';
import { GameView } from '../game3d/view';
import { api, TvLink, useLink } from '../lib/net';
import { tvKey } from '../lib/storage';
import { Loading } from '../App';
import { Logo } from '../ui/Logo';
import { Director } from './director';
import { Hud } from './hud';
import { Lobby } from './Lobby';
import { IntroCard, PauseMenu, Podium, Results, Standings } from './Screens';
import '../styles/tv.css';

/** /tv: make a room and move to it. */
export function NewRoom() {
  const [, go] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api.createRoom().then(
      ({ code, key }) => {
        tvKey.set(code, key);
        go(`/tv/${code}`, { replace: true });
      },
      (e: Error) => setError(e.message),
    );
  }, [go]);
  if (error)
    return (
      <div className="screen-center">
        <Logo />
        <p className="notice">{error}</p>
        <button className="btn btn--go" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  return <Loading text="Building the track…" />;
}

export function Tv({ code }: { code: string }) {
  const key = tvKey.get(code);
  const [, go] = useLocation();
  if (!key)
    return (
      <div className="screen-center">
        <Logo />
        <p>Room {code} is being shown on another screen.</p>
        <button className="btn btn--host" onClick={() => go('/tv')}>
          Start a new room here
        </button>
      </div>
    );
  return <TvRoom code={code} roomKey={key} />;
}

function TvRoom({ code, roomKey }: { code: string; roomKey: string }) {
  const link = useMemo(() => new TvLink(code, roomKey), [code, roomKey]);
  const snap = useLink(link);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const [director, setDirector] = useState<Director | null>(null);
  const [sound, setSound] = useState(audioReady());
  const [, go] = useLocation();
  // The corner buttons get out of the way once nobody is at the mouse.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 3000);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), 3000);
    };
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const view = new GameView(canvas);
    const hud = new Hud(hudRef.current!);
    const d = new Director(link, view, hud);
    d.begin();
    setDirector(d);
    // A handle for poking at the game from the console while developing.
    if (import.meta.env.DEV) (window as unknown as { raceoff: unknown }).raceoff = { link, director: d, view, hud };
    const ro = new ResizeObserver(() => {
      view.resize();
    });
    ro.observe(canvas);
    return () => {
      ro.disconnect();
      d.end();
      hud.root.remove();
      view.dispose();
    };
  }, [link]);

  useEffect(() => {
    if (director && snap?.room) director.setRoom(snap.room);
  }, [director, snap?.room]);

  // Another screen took the room over, or it closed: stop racing, rendering and playing sound behind the notice.
  const over = snap?.status === 'ended' || snap?.status === 'rejected';
  useEffect(() => {
    if (over) director?.end();
  }, [over, director]);

  // Keys for the TV itself: full screen, pause.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
      if ((e.code === 'Escape' || e.code === 'KeyP') && director) {
        const st = director.getState();
        if (st.phase === 'race' || st.phase === 'intro') director.setPaused(!st.paused);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [director]);

  const enableSound = () => {
    void unlockAudio().then(() => {
      setSound(audioReady());
      const st = director?.getState();
      if (!st) return;
      if (st.phase === 'lobby') music.play('menu');
      else if (st.phase === 'results' || st.phase === 'standings') music.play('results');
      else if (st.phase === 'podium') music.play('podium');
      else music.play(songFor(st.track));
    });
  };

  if (snap?.status === 'rejected')
    return (
      <div className="screen-center">
        <Logo />
        <p>{snap.reason === 'no_room' ? `Room ${code} has closed.` : 'This screen can no longer show that room.'}</p>
        <button className="btn btn--host" onClick={() => go('/tv')}>
          Start a new room
        </button>
      </div>
    );
  if (snap?.status === 'ended')
    return (
      <div className="screen-center">
        <Logo />
        <p>{snap.reason === 'replaced' ? 'This room was opened on another screen.' : 'The room has closed.'}</p>
        <button className="btn btn--host" onClick={() => go('/tv')}>
          Start a new room
        </button>
      </div>
    );

  return (
    <div className="tv" onPointerDown={sound ? undefined : enableSound}>
      <canvas ref={canvasRef} className="tv__canvas" />
      <div ref={hudRef} className="tv__hud" />
      {director && snap?.room && <TvOverlay director={director} link={link} room={snap.room} />}
      {snap?.status !== 'online' && <span className="pill pill--warn tv__status">Reconnecting…</span>}
      <div className={`tv__corner${idle && sound ? ' is-idle' : ''}`}>
        {!sound && (
          <button className="pill pill--sound" onClick={enableSound}>
            🔊 Click for sound
          </button>
        )}
        <button className="pill" onClick={toggleFullscreen} title="Full screen (F)">
          ⛶
        </button>
      </div>
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

function TvOverlay({ director, link, room }: { director: Director; link: TvLink; room: import('@raceoff/shared').RoomView }) {
  const st = useSyncExternalStore(director.subscribe, director.getState);
  useEffect(() => {
    if (st.phase === 'results' || st.phase === 'standings') play('select');
  }, [st.phase]);
  switch (st.phase) {
    case 'lobby':
      return <Lobby director={director} link={link} room={room} />;
    case 'intro':
      return (
        <>
          <IntroCard state={st} room={room} />
          {st.paused && <PauseMenu director={director} />}
        </>
      );
    case 'race':
      return st.paused ? <PauseMenu director={director} /> : null;
    case 'results':
      return <Results state={st} director={director} room={room} />;
    case 'standings':
      return <Standings state={st} director={director} room={room} />;
    case 'podium':
      return <Podium state={st} director={director} room={room} />;
  }
}
