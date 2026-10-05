import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { Horizon } from '../src/world/horizon';

// The ring's build (DEM reads) stubbed out: what's under test is when update() tries again.
function ring(results: (THREE.Mesh | null | Error)[]) {
  const h = new Horizon({ lat: 40.36, lon: -73.97 }, { climate: 'temperate' }, true);
  const calls: [number, number][] = [];
  (h as unknown as { build: (x: number, z: number) => Promise<THREE.Mesh | null> }).build = async (x, z) => {
    calls.push([x, z]);
    const r = results.shift() ?? null;
    if (r instanceof Error) throw r;
    return r;
  };
  return { h, calls };
}
const settle = () => new Promise((r) => setTimeout(r, 0));
const mesh = () => Object.assign(new THREE.Mesh(new THREE.BufferGeometry()), { name: 'horizon:ring' });

describe('horizon ring', () => {
  let now = 0;
  afterEach(() => vi.restoreAllMocks());
  const clock = () => vi.spyOn(performance, 'now').mockImplementation(() => now);

  it('a first build that came to nothing is tried again where you stand, on a backoff', async () => {
    // (it used to wait for a 5 km walk: a desktop's first build, racing the town's own DEM reads,
    // left the arrival with no mountains on the horizon at all)
    clock();
    now = 0;
    const { h, calls } = ring([null, new Error('timed out'), mesh()]);
    h.update(0, 0);
    await settle();
    expect(h.lastFail).toBe('no DEM');
    h.update(10, 10); // (standing still: not yet)
    now = 29000;
    h.update(10, 10);
    await settle();
    expect(calls.length).toBe(1);
    now = 30001;
    h.update(10, 10);
    await settle();
    expect(calls.length).toBe(2);
    expect(h.lastFail).toBe('timed out');
    now = 30001 + 59000; // (the backoff doubled)
    h.update(10, 10);
    await settle();
    expect(calls.length).toBe(2);
    now = 30001 + 60001;
    h.update(10, 10);
    await settle();
    expect(calls.length).toBe(3);
    expect(h.lastFail).toBeNull();
    expect(h.group.getObjectByName('horizon:ring')).toBeTruthy();
  });

  it('a built ring is left alone until a 5 km walk', async () => {
    clock();
    now = 0;
    const { h, calls } = ring([mesh(), mesh()]);
    h.update(0, 0);
    await settle();
    now = 3_600_000;
    h.update(4900, 0);
    await settle();
    expect(calls.length).toBe(1);
    h.update(5100, 0);
    await settle();
    expect(calls).toEqual([[0, 0], [5000, 0]]);
    expect(h.group.children.length).toBe(1);
  });

  it('the backoff tops out at ten minutes', async () => {
    clock();
    now = 0;
    const { h, calls } = ring(Array(12).fill(null));
    for (let k = 0; k < 12; k++) {
      now += 600001;
      h.update(0, 0);
      await settle();
    }
    expect(calls.length).toBe(12);
  });
});
