import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Pool } from './items3d';

describe('Pool', () => {
  it('puts a gone item away and gives its model to the next, without freeing its materials', () => {
    const parent = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    let disposed = 0;
    material.addEventListener('dispose', () => disposed++);
    let made = 0;
    const pool = new Pool(parent, () => (made++, new THREE.Mesh(new THREE.BoxGeometry(), material)));

    pool.begin();
    const a = pool.get(1);
    a.userData.last = new THREE.Vector3(5, 0, 5);
    pool.end();
    // Item 1 is gone: its model is hidden, not freed.
    pool.begin();
    pool.end();
    expect(a.visible).toBe(false);
    expect(disposed).toBe(0);
    // The next item takes it over, its trail starting afresh.
    pool.begin();
    const b = pool.get(2);
    pool.end();
    expect(b).toBe(a);
    expect(b.visible).toBe(true);
    expect(b.userData.last).toBeUndefined();
    expect(made).toBe(1);
    expect(parent.children.length).toBe(1);

    pool.clear();
    expect(parent.children.length).toBe(0);
    expect(disposed).toBe(1);
  });
});
