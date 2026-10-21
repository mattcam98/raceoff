/**
 * Phone buzzes. Android vibrates; iPhones ignore it (Safari has no vibration
 * API), which is fine: every buzz has a sound or picture on the TV as well.
 */
import type { HapticKind } from '@raceoff/shared';
import { prefs } from '../lib/storage';

const PATTERNS: Record<HapticKind, number | number[]> = {
  hit: [60, 40, 90],
  item: 25,
  boost: 35,
  bump: 18,
  lap: [30, 50, 30],
  finish: [80, 60, 80, 60, 160],
  go: 120,
  tick: 12,
};

let enabled = prefs.get('haptics', true);

export function setHaptics(on: boolean) {
  enabled = on;
  prefs.set('haptics', on);
}

export const hapticsOn = () => enabled;
export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;

export function buzz(kind: HapticKind) {
  if (!enabled || !canVibrate()) return;
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    /* some browsers throw when not allowed yet */
  }
}
