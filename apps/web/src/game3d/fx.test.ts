import { describe, expect, it } from 'vitest';
import { rate } from './fx';

describe('rate', () => {
  it('emits whole particles per frame and the fraction by chance, averaging the rate at any frame rate', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.1]) {
      let n = 0;
      const frames = Math.round(200 / dt);
      for (let i = 0; i < frames; i++) n += rate(30, dt);
      expect(n / 200).toBeGreaterThan(28.5);
      expect(n / 200).toBeLessThan(31.5);
    }
    expect(rate(0, 1 / 60)).toBe(0);
  });
});
