import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Commissions } from '../src/ui/commissions';
import type { GameCtx } from '../src/ui/ctx';

// Just enough of the game for the Almanac: a moored skiff and a parked pickup in the middle of the
// frame, nothing else round you.
const ctx = (things: { x: number; z: number; name: string }[], fov = 62) => ({
  walker: { x: 0, z: 0, y: 1.65, yaw: 0 },
  camera: { fov, aspect: 16 / 9 },
  instances: (prefix: string) => things.filter((t) => t.name.startsWith(prefix)).map((t) => ({ ...t, y: 0 })),
  toNdc: () => new THREE.Vector3(0.1, 0, 0.5),
  toLatLon: () => [40.37, -73.97] as [number, number],
  locality: () => 'Sea Bright',
  region: () => 'Monmouth County, New Jersey',
  json: { pois: [] },
  footprints: () => [],
  terrain: { heightAt: () => 0 },
}) as unknown as GameCtx;

describe('paint-to-own (docs/GAME_DESIGN.md §4a)', () => {
  it('your first painting teaches the one thing it is of; after that, what is composed', () => {
    // a pickup 6 m off (≈10% of the frame) and a skiff 7 m off (≈5%): the first painting teaches
    // the pickup alone — the skiff stays a pencil card
    const com = new Commissions(ctx([{ x: 4, z: -5.5, name: 'moored-boats:skiff' }, { x: -3, z: -5, name: 'kerb-cars:pickup' }]));
    expect(com.owned(['boat', 'car'])).toEqual([]);
    expect(com.paintFrame('pg-1').length).toBe(1);
    expect(com.fresh).toEqual(['car:pickup']);
    expect(!!com.state.seen?.['boat:skiff']?.painted).toBe(false);
    expect(com.state.seen?.['boat:skiff']).toBeTruthy(); // (a pencil card: seen)
    // the second painting: the skiff fills ≥ 4%, so it's taught now
    com.paintFrame('pg-2');
    expect(com.fresh).toEqual(['boat:skiff']);
    expect(com.owned(['boat', 'car']).map((k) => `${k.family}:${k.type}`).sort()).toEqual(['boat:skiff', 'car:pickup']);
    // painting the same things again teaches nothing new
    com.paintFrame('pg-3');
    expect(com.fresh).toEqual([]);
  });

  it('a marina painted from the bank teaches at most three, and only what fills the frame — zoom in to reach further', () => {
    const boats = ['skiff', 'console', 'cabin', 'sail', 'pontoon', 'lobster'].map((t, i) => ({ x: -10 + i * 4, z: -30, name: `moored-boats:${t}` }));
    const com = new Commissions(ctx([...boats, { x: 1, z: -4, name: 'kerb-cars:sedan' }]));
    com.paintFrame('pg-1'); // (the sedan close by: the first card)
    expect(com.fresh).toEqual(['car:sedan']);
    com.paintFrame('pg-2'); // 30 m out at 62°: none of the boats fills 4%
    expect(com.fresh).toEqual([]);
    const zoomed = new Commissions(ctx([...boats, { x: 1, z: -4, name: 'kerb-cars:sedan' }], 20));
    zoomed.state = com.state;
    zoomed.paintFrame('pg-3'); // at 20° the biggest three do
    expect(zoomed.fresh.length).toBe(3);
    expect(zoomed.fresh.every((k) => k.startsWith('boat:'))).toBe(true);
  });

  it('only coloured cards count: seen in pencil is not yet yours, and unknown kinds never are', () => {
    const com = new Commissions(ctx([]));
    com.state.seen = {
      'boat:lobster': { t: 1, lat: 0, lon: 0, town: '', region: '' }, // seen, never painted
      'boat:skiff': { t: 2, lat: 0, lon: 0, town: '', region: '', painted: true, pt: 10 },
      'boat:console': { t: 3, lat: 0, lon: 0, town: '', region: '', painted: true, pt: 30 },
      'boat:hovercraft': { t: 4, lat: 0, lon: 0, town: '', region: '', painted: true, pt: 40 },
      'wildlife:heron': { t: 5, lat: 0, lon: 0, town: '', region: '', painted: true, pt: 50 },
    };
    // newest painted first
    expect(com.owned(['boat', 'car']).map((k) => k.type)).toEqual(['console', 'skiff']);
  });
});
