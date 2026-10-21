import { normalizeRoomCode, ROOM_CODE_LENGTH } from '@raceoff/shared';
import { Component, lazy, Suspense, type ReactNode } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { Home } from './views/Home';
import { Phone } from './phone/Phone';

/** The TV (three.js and all) loads as its own chunk, so phones never download it. */
const Tv = lazy(async () => ({ default: (await import('./tv/Tv')).Tv }));
const NewRoom = lazy(async () => ({ default: (await import('./tv/Tv')).NewRoom }));
const Records = lazy(async () => ({ default: (await import('./views/Records')).Records }));

const code = (raw: string | undefined) => normalizeRoomCode(raw ?? '');

export function App() {
  return (
    <Crash>
      <Suspense fallback={<Loading />}>
        <Switch>
          <Route path="/">{() => <Home />}</Route>
          <Route path="/tv">{() => <NewRoom />}</Route>
          <Route path="/tv/:code">{(p) => <Tv key={code(p.code)} code={code(p.code)} />}</Route>
          <Route path="/join/:code">{(p) => <Phone key={code(p.code)} code={code(p.code)} />}</Route>
          <Route path="/play/:code">{(p) => <Phone key={code(p.code)} code={code(p.code)} />}</Route>
          <Route path="/records">{() => <Records />}</Route>
          {/* Typing just the code after the address works too. */}
          <Route path="/:code">{(p) => (code(p.code).length === ROOM_CODE_LENGTH ? <Redirect to={`/join/${code(p.code)}`} /> : <Redirect to="/" />)}</Route>
        </Switch>
      </Suspense>
    </Crash>
  );
}

export function Loading({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="screen-center">
      <div className="spinner" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen-center">
        <h1 className="title">Crash!</h1>
        <p>Something went wrong: {this.state.error.message}</p>
        <button className="btn btn--go" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
