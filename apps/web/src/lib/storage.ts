/**
 * Small wrappers around browser storage that never throw (private mode, blocked storage). Values are also
 * kept in memory, so with storage blocked the app still works until the page is reloaded.
 */

const memory = new Map<string, string>();

function get(store: () => Storage, key: string): string | null {
  try {
    const value = store().getItem(key);
    if (value !== null) return value;
  } catch {
    /* storage unavailable: fall back to memory */
  }
  return memory.get(key) ?? null;
}
function put(store: () => Storage, key: string, value: string | null) {
  if (value === null) memory.delete(key);
  else memory.set(key, value);
  try {
    if (value === null) store().removeItem(key);
    else store().setItem(key, value);
  } catch {
    /* storage unavailable: the app works without it */
  }
}

const local = () => window.localStorage;

/** The TV's key for a room lives as long as the browser keeps it, so a reload rejoins as the TV. */
export const tvKey = {
  get: (code: string) => get(local, `raceoff.tv.${code}`),
  set: (code: string, key: string) => put(local, `raceoff.tv.${code}`, key),
};

export interface Seat {
  token: string;
  playerId: string;
}

/** A phone's seat in a room. */
export const seat = {
  get(code: string): Seat | null {
    const raw = get(local, `raceoff.seat.${code}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Seat;
    } catch {
      return null;
    }
  },
  set: (code: string, s: Seat | null) => put(local, `raceoff.seat.${code}`, s ? JSON.stringify(s) : null),
};

/** This browser's sign-in to the settings page. */
export const adminToken = {
  get: () => get(local, 'raceoff.admin'),
  set: (token: string | null) => put(local, 'raceoff.admin', token),
};

export const prefs = {
  get<T>(key: string, fallback: T): T {
    const raw = get(local, `raceoff.pref.${key}`);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set: (key: string, value: unknown) => put(local, `raceoff.pref.${key}`, JSON.stringify(value)),
};
