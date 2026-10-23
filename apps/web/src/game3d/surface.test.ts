import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bumpFrom, roughFrom } from './surface';

// Just enough of a 2D canvas for the relief painter to read and write pixels.
function fakeCanvas(w = 4, h = 4) {
  const c = {
    width: w,
    height: h,
    getContext: () => ({
      getImageData: () => ({ data: new Uint8ClampedArray(c.width * c.height * 4).fill(128) }),
      createImageData: (iw: number, ih: number) => ({ data: new Uint8ClampedArray(iw * ih * 4) }),
      putImageData: () => {},
    }),
  };
  return c;
}
(globalThis as { document?: unknown }).document = { createElement: () => fakeCanvas() };

describe('relief maps', () => {
  it('are made once per picture, not once per copy of its texture', () => {
    const t = new THREE.Texture(fakeCanvas() as unknown as HTMLCanvasElement);
    // A world's floor material takes a fresh copy of the theme's texture every build.
    expect(bumpFrom(t.clone(), 2)).toBe(bumpFrom(t, 2));
    expect(roughFrom(t.clone(), 0.9, 0.5)).toBe(roughFrom(t, 0.9, 0.5));
    expect(bumpFrom(t, 3)).not.toBe(bumpFrom(t, 2));
  });
});
