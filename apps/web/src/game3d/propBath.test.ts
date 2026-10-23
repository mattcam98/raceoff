import { getTrack, SURF } from '@raceoff/game';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bath } from './propBath';

describe('the bath track tub', () => {
  it('stands no higher than a low lip anywhere the road runs, so karts and the chase camera pass clear of it', () => {
    const track = getTrack('bath');
    const place = track.def.props!.find((p) => p.k === 'tub')!;
    const tub = bath.tub();
    tub.position.set(place.x, place.y ?? track.def.floorY, place.z);
    tub.updateMatrixWorld(true);
    const { grid } = track;
    const v = new THREE.Vector3();
    let worst = -Infinity;
    tub.traverse((o) => {
      const pos = (o as THREE.Mesh).geometry?.attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const c = grid.index(v.x, v.z);
        // The road itself, not the bath water beside it (whose cells are sunk below the floor).
        if (c < 0 || grid.surf[c] !== SURF.road) continue;
        worst = Math.max(worst, v.y - grid.heightAt(v.x, v.z, track.def.floorY));
      }
    });
    expect(worst).toBeLessThan(0.5);
  });
});
